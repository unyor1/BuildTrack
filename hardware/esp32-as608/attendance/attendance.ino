// BuildTrack ESP32 / compatible AS608 UART protocol reference firmware.
// Admin starts enrollment on the website; slot assignment and confirmation are automatic.
// No fingerprint image/template leaves the sensor. Requires ArduinoJson 7.x.
#include <WiFi.h>
#include <NetworkClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <Adafruit_Fingerprint.h>
#include <ArduinoJson.h>
#include <esp_system.h>
#include <time.h>
#include "config.h"

HardwareSerial sensorSerial(2);
Adafruit_Fingerprint sensor(&sensorSerial);
Preferences queueStore;
String pending;
bool fingerHeld = true; // A reboot with a finger still present must not create a second event.
bool sensorReady = false;
unsigned long lastSend = 0;
String enrollmentResult;
unsigned long lastEnrollment = 0;

bool enrollmentPost(const String &body, JsonDocument &response) {
  NetworkClientSecure tls;
  tls.setCACert(ROOT_CA);
  HTTPClient http;
  http.setTimeout(10000);
  if (!http.begin(tls, ENROLLMENT_URL)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-token", DEVICE_TOKEN);
  int status = http.POST(body);
  String payload = http.getString();
  http.end();
  if (status != 200 || payload.length() > 2048) return false;
  return !deserializeJson(response, payload);
}

bool waitForFinger(bool present, unsigned long timeout) {
  unsigned long start = millis();
  while (millis()-start < timeout) {
    uint8_t result = sensor.getImage();
    if (present && result == FINGERPRINT_OK) return true;
    if (!present && result == FINGERPRINT_NOFINGER) return true;
    if (result != FINGERPRINT_NOFINGER && result != FINGERPRINT_OK) return false;
    delay(75);
  }
  return false;
}

String enrollWorker(uint16_t slot, const String &requestId) {
  // Never overwrite a pre-existing/unmanaged template. Other responses fail closed.
  if (sensor.loadModel(slot) != FINGERPRINT_DBRANGEFAIL) return "Slot unavailable or sensor could not confirm it is empty. Retry from Admin.";
  Serial.println("ADMIN ENROLLMENT: remove finger, then place the worker's finger.");
  if (!waitForFinger(false, 10000) || !waitForFinger(true, 25000) || sensor.image2Tz(1) != FINGERPRINT_OK) return "First finger capture failed or timed out.";
  uint8_t match = sensor.fingerSearch(1);
  if (match == FINGERPRINT_OK) return "This finger is already stored on this sensor. Check the existing worker.";
  if (match != FINGERPRINT_NOTFOUND) return "Sensor could not check for an existing fingerprint.";
  Serial.println("Lift finger, then place the SAME finger again.");
  if (!waitForFinger(false, 15000) || !waitForFinger(true, 25000) || sensor.image2Tz(2) != FINGERPRINT_OK) return "Second finger capture failed or timed out.";
  if (sensor.createModel() != FINGERPRINT_OK) return "The two fingerprint captures did not match. Retry.";
  // Re-check Admin cancellation/expiry just before storing. Cancellation can leave an orphan slot, never a worker mapping.
  JsonDocument check;
  String poll = "{\"device_id\":\"" + String(DEVICE_ID) + "\",\"action\":\"poll\",\"capacity\":" + String(sensor.capacity) + "}";
  if (!enrollmentPost(poll, check) || !check["job"]["id"].is<const char *>() || requestId != check["job"]["id"].as<String>()) return "Enrollment cancelled, expired or network unavailable.";
  if (sensor.storeModel(slot) != FINGERPRINT_OK) return "Sensor could not store the fingerprint. Retry.";
  return "";
}

void handleEnrollment() {
  if (millis()-lastEnrollment < 3000) return;
  lastEnrollment = millis();
  if (enrollmentResult.length()) {
    JsonDocument ack;
    if (enrollmentPost(enrollmentResult, ack) && ack["acknowledged"].is<bool>() && ack["acknowledged"].as<bool>()) {
      if (!queueStore.remove("enrollment")) { Serial.println("Enrollment acknowledgement storage failed. Terminal paused."); return; }
      enrollmentResult = "";
      Serial.println(ack["discarded"].as<bool>() ? "Enrollment was cancelled/expired; worker was NOT linked. Check Admin." : "Enrollment result acknowledged. Check Admin status.");
    }
    return;
  }
  JsonDocument response;
  String poll = "{\"device_id\":\"" + String(DEVICE_ID) + "\",\"action\":\"poll\",\"capacity\":" + String(sensor.capacity) + "}";
  if (!enrollmentPost(poll, response) || response["job"].isNull()) return;
  String id = response["job"]["id"].as<String>();
  unsigned int slot = response["job"]["slot"].as<unsigned int>();
  if (id.length() != 36 || !slot || slot > sensor.capacity) return;
  // Store a conservative failure BEFORE touching the sensor. Reboot never re-enrolls/overwrites a slot.
  JsonDocument result;
  result["device_id"] = DEVICE_ID; result["action"] = "failed"; result["request_id"] = id;
  result["error"] = "Enrollment interrupted. Admin must retry with the worker present.";
  String durable;
  serializeJson(result, durable);
  if (!queueStore.putString("enrollment", durable)) { Serial.println("Cannot persist enrollment. Capture not started."); return; }
  enrollmentResult = durable;
  Serial.printf("Admin enrollment for %s. Follow the finger placement prompts.\n", response["job"]["worker_name"].as<const char *>());
  String problem = enrollWorker((uint16_t)slot, id);
  result["action"] = problem.length() ? "failed" : "completed";
  result["error"] = problem;
  durable = ""; serializeJson(result, durable);
  if (queueStore.putString("enrollment", durable)) enrollmentResult = durable;
  else Serial.println("Could not persist enrollment result. Conservative failure retained; Admin must reconcile.");
  fingerHeld = true;
}

String eventUuid() {
  uint8_t bytes[16];
  esp_fill_random(bytes, sizeof(bytes));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  char value[37];
  snprintf(value, sizeof(value), "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    bytes[0],bytes[1],bytes[2],bytes[3],bytes[4],bytes[5],bytes[6],bytes[7],bytes[8],bytes[9],bytes[10],bytes[11],bytes[12],bytes[13],bytes[14],bytes[15]);
  return String(value);
}

bool validClock() { return time(nullptr) > 1767225600; } // Fail closed before a plausible synchronized clock (2026).

void sendPending() {
  if (!pending.length() || WiFi.status() != WL_CONNECTED || !validClock()) return;
  if (millis() - lastSend < 5000) return;
  lastSend = millis();
  NetworkClientSecure tls;
  tls.setCACert(ROOT_CA); // Always validate server identity.
  HTTPClient http;
  http.setTimeout(10000);
  if (!http.begin(tls, ATTENDANCE_URL)) return;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-token", DEVICE_TOKEN);
  const int status = http.POST(pending);
  const String response = http.getString();
  http.end();
  if (status == 200 && response.startsWith("{\"recorded\":true,\"event_id\":\"") && response.endsWith("\"}")) {
    // Clear durable storage before accepting any further scan. Duplicate delivery is safe if power fails here.
    if (!queueStore.remove("pending")) {
      Serial.println("Storage clear failed. Pending event retained; no new scans accepted.");
      return;
    }
    pending = "";
    Serial.println("Attendance recorded by database. Remove finger before scanning again.");
  } else {
    Serial.printf("Attendance NOT confirmed (HTTP %d). Pending event retained.\n", status);
    // 401/422 require administrator correction; do not delete the event or accept another scan silently.
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(DIRECTION_PIN, INPUT_PULLUP);
  if (!queueStore.begin("bt-attendance", false)) {
    Serial.println("Cannot open durable event storage. Stopped.");
    while (true) delay(1000);
  }
  pending = queueStore.getString("pending", "");
  enrollmentResult = queueStore.getString("enrollment", "");
  if (strlen(DEVICE_ID) != 36 || strlen(DEVICE_TOKEN) != 64 || !strstr(ROOT_CA,"BEGIN CERTIFICATE")) {
    Serial.println("Configure device ID/token and a verified TLS root CA in private config.h. Stopped.");
    while (true) delay(1000);
  }
  sensorSerial.begin(SENSOR_BAUD, SERIAL_8N1, SENSOR_RX, SENSOR_TX);
  sensor.begin(SENSOR_BAUD);
  sensorReady = sensor.verifyPassword();
  sensorReady = sensorReady && sensor.getParameters() == FINGERPRINT_OK && sensor.capacity > 0;
  Serial.println(sensorReady ? "Sensor available. Ready after time sync and finger removal." : "Sensor unavailable. Check protocol, baud and wiring.");
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
}

void loop() {
  sendPending();
  // This minimal reference has ONE durable pending slot, not a multi-worker offline queue.
  // Block further captures until it is acknowledged; the serial status must remain visible to the operator.
  if (pending.length() || !sensorReady || !validClock() || WiFi.status() != WL_CONNECTED) { delay(100); return; }
  handleEnrollment();
  if (enrollmentResult.length()) { delay(100); return; }
  const uint8_t image = sensor.getImage();
  if (image == FINGERPRINT_NOFINGER) { fingerHeld = false; delay(75); return; }
  if (image != FINGERPRINT_OK || fingerHeld) { delay(75); return; }
  fingerHeld = true;
  if (sensor.image2Tz() != FINGERPRINT_OK || sensor.fingerFastSearch() != FINGERPRINT_OK) {
    Serial.println("Fingerprint not matched. No attendance event created. Remove finger and retry.");
    return;
  }
  const time_t scanTime = time(nullptr);
  struct tm utc;
  gmtime_r(&scanTime, &utc);
  char stamp[25];
  strftime(stamp, sizeof(stamp), "%Y-%m-%dT%H:%M:%SZ", &utc);
  const char *direction = digitalRead(DIRECTION_PIN) == LOW ? "out" : "in";
  // All variable payload strings are validated config UUIDs or generated IDs/numbers, not worker-entered text.
  const String event = "{\"device_id\":\"" + String(DEVICE_ID) + "\",\"biometric_uid\":\"" + String(sensor.fingerID)
    + "\",\"direction\":\"" + direction + "\",\"occurred_at\":\"" + stamp + "\",\"event_id\":\"" + eventUuid() + "\"}";
  if (queueStore.putString("pending", event) == 0) {
    Serial.println("Storage write failed. Attendance NOT saved or transmitted. Remove finger and retry.");
    return;
  }
  pending = event;
  Serial.printf("Matched ID %u, %s. Awaiting server confirmation; no further scans until acknowledged.\n", sensor.fingerID, direction);
}
