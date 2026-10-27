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
#if __has_include("config.h")
#include "config.h"
#else
// Allows Verify before private setup. Placeholder credentials stop setup() safely.
// Copy config.example.h to config.h and fill it locally before attendance use.
#include "config.example.h"
#endif

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

// Report a capture step to the Admin screen. Returns false only when the server says the request was cancelled or
// expired, so the device stops. Network trouble never stops a capture: the step is guidance, not the result.
bool reportStage(const String &requestId, const char *stage) {
  JsonDocument body, reply;
  body["device_id"] = DEVICE_ID; body["action"] = "progress"; body["request_id"] = requestId; body["stage"] = stage;
  String text;
  serializeJson(body, text);
  if (!enrollmentPost(text, reply)) return true;
  return !(reply["discarded"].is<bool>() && reply["discarded"].as<bool>());
}

// Remove a template this device stored a moment ago but that was never confirmed or linked. An unlinked template
// would otherwise match later scans and stop the terminal with a rejected attendance event.
String removeStored(uint16_t slot, const char *reason) {
  if (sensor.deleteModel(slot) == FINGERPRINT_OK) { queueStore.remove("enroll_slot"); return reason; }
  return String(reason) + " Slot could not be cleared; Admin must check the scanner.";
}

String enrollWorker(uint16_t slot, const String &requestId) {
  const char *stopped = "Enrollment cancelled or expired. Nothing was registered.";
  // Never overwrite a pre-existing/unmanaged template. Other responses fail closed.
  if (sensor.loadModel(slot) != FINGERPRINT_DBRANGEFAIL) return "Slot unavailable or sensor could not confirm it is empty. Retry from Admin.";
  Serial.println("ADMIN ENROLLMENT: remove finger, then place the worker's finger.");
  if (!waitForFinger(false, 10000)) return "A finger stayed on the scanner. Lift it and retry.";
  if (!reportStage(requestId, "place_first")) return stopped;
  if (!waitForFinger(true, 25000) || sensor.image2Tz(1) != FINGERPRINT_OK) return "First finger capture failed or timed out.";
  uint8_t match = sensor.fingerSearch(1);
  if (match == FINGERPRINT_OK) return "This finger is already stored on this sensor. Check the existing worker.";
  if (match != FINGERPRINT_NOTFOUND) return "Sensor could not check for an existing fingerprint.";
  Serial.println("Lift finger.");
  if (!reportStage(requestId, "lift")) return stopped;
  if (!waitForFinger(false, 15000)) return "The finger was not lifted in time. Retry.";
  if (!reportStage(requestId, "place_second")) return stopped;
  Serial.println("Place the SAME finger again.");
  if (!waitForFinger(true, 25000) || sensor.image2Tz(2) != FINGERPRINT_OK) return "Second finger capture failed or timed out.";
  if (sensor.createModel() != FINGERPRINT_OK) return "The two fingerprint captures did not match. Retry.";
  if (!reportStage(requestId, "storing")) return stopped;
  // Re-check Admin cancellation/expiry just before storing. Cancellation can leave an orphan slot, never a worker mapping.
  JsonDocument check;
  String poll = "{\"device_id\":\"" + String(DEVICE_ID) + "\",\"action\":\"poll\",\"capacity\":" + String(sensor.capacity) + "}";
  if (!enrollmentPost(poll, check) || !check["job"]["id"].is<const char *>() || requestId != check["job"]["id"].as<String>()) return "Enrollment cancelled, expired or network unavailable.";
  // Remember the slot BEFORE storing, so a reboot or a later cancellation can remove an unconfirmed template.
  if (!queueStore.putInt("enroll_slot", slot)) return "Cannot persist enrollment slot. Nothing was stored.";
  if (sensor.storeModel(slot) != FINGERPRINT_OK) { queueStore.remove("enroll_slot"); return "Sensor could not store the fingerprint. Retry."; }
  // Confirmation: the worker scans once more and the scanner must find exactly the slot just saved.
  Serial.println("Saved on the scanner. Lift finger, then place the SAME finger once more to confirm.");
  if (!reportStage(requestId, "confirm")) return removeStored(slot, stopped);
  if (!waitForFinger(false, 15000) || !waitForFinger(true, 25000) || sensor.image2Tz(1) != FINGERPRINT_OK) return removeStored(slot, "Confirmation scan failed or timed out. Nothing was registered.");
  if (sensor.fingerSearch(1) != FINGERPRINT_OK || sensor.fingerID != slot) return removeStored(slot, "Confirmation scan did not match the saved finger. Nothing was registered.");
  Serial.println("Confirmation scan matched. Sending the result.");
  return "";
}

void handleEnrollment() {
  if (millis()-lastEnrollment < 3000) return;
  lastEnrollment = millis();
  if (enrollmentResult.length()) {
    JsonDocument ack;
    if (enrollmentPost(enrollmentResult, ack) && ack["acknowledged"].is<bool>() && ack["acknowledged"].as<bool>()) {
      if (!queueStore.remove("enrollment")) { Serial.println("Enrollment acknowledgement storage failed. Terminal paused."); return; }
      const bool discarded = ack["discarded"].is<bool>() && ack["discarded"].as<bool>();
      // A stored template that was not linked (failure, cancellation, expiry or a reboot mid-enrollment) is removed.
      const int stored = queueStore.getInt("enroll_slot", 0);
      if (stored > 0) {
        if ((discarded || enrollmentResult.indexOf("\"action\":\"failed\"") >= 0) && sensor.deleteModel((uint16_t)stored) != FINGERPRINT_OK)
          Serial.printf("Could not clear unconfirmed scanner slot %d. Admin must check the scanner.\n", stored);
        queueStore.remove("enroll_slot");
      }
      enrollmentResult = "";
      Serial.println(discarded ? "Enrollment was cancelled/expired; worker was NOT linked. Check Admin." : "Enrollment result acknowledged. Check Admin status.");
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

bool validClock();

// An unknown finger is reported so the attendance screen can show "Fingerprint not registered". Best effort only:
// never stored or retried, at most once every 3 s, and it never blocks the next scan.
void reportUnmatched() {
  static unsigned long lastReport = 0;
  if (WiFi.status() != WL_CONNECTED || !validClock() || (lastReport && millis() - lastReport < 3000UL)) return;
  lastReport = millis();
  const time_t now = time(nullptr);
  struct tm utc;
  gmtime_r(&now, &utc);
  char stamp[25];
  strftime(stamp, sizeof(stamp), "%Y-%m-%dT%H:%M:%SZ", &utc);
  const String body = "{\"device_id\":\"" + String(DEVICE_ID) + "\",\"result\":\"no_match\",\"occurred_at\":\"" + stamp + "\",\"event_id\":\"" + eventUuid() + "\"}";
  NetworkClientSecure tls;
  tls.setCACert(ROOT_CA);
  HTTPClient http;
  http.setTimeout(8000);
  if (!http.begin(tls, ATTENDANCE_URL)) return;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-token", DEVICE_TOKEN);
  const int status = http.POST(body);
  http.end();
  if (status != 200) Serial.printf("(Unregistered-finger notice not delivered, HTTP %d.)\n", status);
}

bool validClock() { return time(nullptr) > 1767225600; } // Fail closed before a plausible synchronized clock (2026).

// Shows an ISO time from the server (UTC) as Philippine time HH:MM.
String manilaClock(const char *iso) {
  int hour = 0, minute = 0;
  if (!iso || strlen(iso) < 16) return String("?");
  if (iso[10] != 'T' || iso[13] != ':' || iso[11] < '0' || iso[11] > '9' || iso[12] < '0' || iso[12] > '9'
      || iso[14] < '0' || iso[14] > '9' || iso[15] < '0' || iso[15] > '9') return String("?");
  hour = (iso[11] - '0') * 10 + (iso[12] - '0');
  minute = (iso[14] - '0') * 10 + (iso[15] - '0');
  if (hour > 23 || minute > 59) return String("?");
  hour = (hour + 8) % 24;
  const char text[6] = { char('0' + hour / 10), char('0' + hour % 10), ':', char('0' + minute / 10), char('0' + minute % 10), '\0' };
  return String(text);
}

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
  JsonDocument reply;
  const bool parsed = status == 200 && response.length() <= 1024 && !deserializeJson(reply, response);
  // Handled = recorded / repeat / older scan (recorded true + event id) or a scan that cannot count ("unregistered").
  const bool unregistered = parsed && strcmp(reply["status"] | "", "unregistered") == 0;
  const bool handled = unregistered || (parsed && reply["recorded"].is<bool>() && reply["recorded"].as<bool>() && reply["event_id"].is<const char *>());
  if (handled) {
    // Clear durable storage before accepting any further scan. Duplicate delivery is safe if power fails here:
    // the server answers a retried event with the same decision and never stores it twice.
    if (!queueStore.remove("pending")) {
      Serial.println("Storage clear failed. Pending event retained; no new scans accepted.");
      return;
    }
    pending = "";
    // The database decides IN/OUT from the worker's scans today; a repeat scan is not recorded again.
    const char *result = reply["status"] | "recorded";
    const char *direction = reply["direction"] | "";
    const String when = manilaClock(reply["occurred_at"] | "");
    const String inOut = strcmp(direction, "out") == 0 ? "OUT" : "IN";
    if (unregistered) {
      const char *reason = reply["reason"] | "";
      if (strcmp(reason, "inactive") == 0) Serial.println(">>> WORKER INACTIVE: nothing recorded. Ask the Admin.");
      else if (strcmp(reason, "other_device") == 0) Serial.println(">>> WRONG SCANNER: this worker is registered on another scanner. Nothing recorded.");
      else Serial.println(">>> FINGERPRINT NOT LINKED to a worker of this project. Nothing recorded. Ask the Admin.");
    }
    else if (strcmp(result, "repeat") == 0) Serial.printf(">>> ALREADY TIMED %s at %s. This scan was not recorded again.\n", inOut.c_str(), when.c_str());
    else if (strcmp(result, "out_of_order") == 0) Serial.println(">>> Older scan ignored: this worker already has a later scan today.");
    else {
      const char *flag = reply["schedule_flag"] | "";
      const int minutes = reply["minutes_off"] | 0;
      String note = "";
      if (strcmp(flag, "late") == 0) note = " (Late " + String(minutes) + " min)";
      else if (strcmp(flag, "early_out") == 0) note = " (Early out " + String(minutes) + " min)";
      Serial.printf("Time %s recorded at %s%s. Remove finger.\n", inOut.c_str(), when.c_str(), note.c_str());
    }
  } else {
    Serial.printf("Attendance NOT confirmed (HTTP %d). Pending event retained.\n", status);
    // 401/422 require administrator correction; do not delete the event or accept another scan silently.
  }
}

void setup() {
  Serial.begin(115200);
  if (!queueStore.begin("bt-attendance", false)) {
    Serial.println("Cannot open durable event storage. Stopped.");
    while (true) delay(1000);
  }
  pending = queueStore.getString("pending", "");
  enrollmentResult = queueStore.getString("enrollment", "");
  if (strlen(DEVICE_ID) != 36 || strlen(DEVICE_TOKEN) != 64 || !strstr(ROOT_CA,"BEGIN CERTIFICATE")) {
    Serial.println("Copy config.example.h to private config.h; configure Wi-Fi, device ID/token and verified TLS root CA. Stopped.");
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
  if (sensor.image2Tz(1) != FINGERPRINT_OK) {
    Serial.println("Could not read the finger clearly. Lift it and place it flat again.");
    return;
  }
  const uint8_t search = sensor.fingerSearch(1);
  if (search == FINGERPRINT_NOTFOUND) {
    Serial.println(">>> FINGERPRINT NOT REGISTERED. Nothing recorded. Ask the Admin to register the worker.");
    reportUnmatched();
    return;
  }
  if (search != FINGERPRINT_OK) {
    Serial.println("Scanner could not check the finger. Lift it and try again.");
    return;
  }
  // Only guards against a double touch; a real second scan goes to the server, which answers "already timed in".
  static uint16_t lastMatchedId = 0;
  static unsigned long lastMatchedAt = 0;
  if (sensor.fingerID == lastMatchedId && millis() - lastMatchedAt < 2000UL) return;
  lastMatchedId = sensor.fingerID;
  lastMatchedAt = millis();
  const time_t scanTime = time(nullptr);
  struct tm utc;
  gmtime_r(&scanTime, &utc);
  char stamp[25];
  strftime(stamp, sizeof(stamp), "%Y-%m-%dT%H:%M:%SZ", &utc);
  // The server decides Time IN / Time OUT ("auto"): a switch left in the wrong position can no longer record a wrong OUT.
  // All variable payload strings are validated config UUIDs or generated IDs/numbers, not worker-entered text.
  const String event = "{\"device_id\":\"" + String(DEVICE_ID) + "\",\"biometric_uid\":\"" + String(sensor.fingerID)
    + "\",\"direction\":\"auto\",\"occurred_at\":\"" + stamp + "\",\"event_id\":\"" + eventUuid() + "\"}";
  if (queueStore.putString("pending", event) == 0) {
    Serial.println("Storage write failed. Attendance NOT saved or transmitted. Remove finger and retry.");
    return;
  }
  pending = event;
  Serial.printf("Matched ID %u. Awaiting server confirmation; no further scans until acknowledged.\n", sensor.fingerID);
}
