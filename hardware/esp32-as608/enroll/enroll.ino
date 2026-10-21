// Local-only enrollment helper for a UART module compatible with Adafruit_Fingerprint.
// Does not connect to WiFi or upload fingerprint images/templates.
#include <Adafruit_Fingerprint.h>
constexpr int SENSOR_RX = 16; // Example ESP32 DevKit pins; verify your board/module first.
constexpr int SENSOR_TX = 17;
constexpr unsigned long SENSOR_BAUD = 57600;
HardwareSerial sensorSerial(2);
Adafruit_Fingerprint sensor(&sensorSerial);

bool capture(uint8_t buffer) {
  const unsigned long start = millis();
  while (millis() - start < 30000) {
    const uint8_t result = sensor.getImage();
    if (result == FINGERPRINT_OK) return sensor.image2Tz(buffer) == FINGERPRINT_OK;
    if (result != FINGERPRINT_NOFINGER) return false;
    delay(100);
  }
  return false;
}

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(1000);
  sensorSerial.begin(SENSOR_BAUD, SERIAL_8N1, SENSOR_RX, SENSOR_TX);
  sensor.begin(SENSOR_BAUD);
  if (!sensor.verifyPassword() || sensor.getParameters() != FINGERPRINT_OK) {
    Serial.println("Sensor not detected. Check datasheet/protocol/pins/baud; enrollment stopped.");
    while (true) delay(1000);
  }
  Serial.println("Send an unused numeric slot ID followed by newline. Enrollment overwrites that slot if already used.");
}

void loop() {
  if (!Serial.available()) { delay(100); return; }
  String input = Serial.readStringUntil('\n');
  input.trim();
  for (unsigned int i = 0; i < input.length(); i++) if (!isDigit(input[i])) { Serial.println("Numeric ID required."); return; }
  const long slot = input.toInt();
  if (slot < 1 || slot >= sensor.capacity) { Serial.println("ID outside this example's supported slot range (1..capacity-1)."); return; }
  Serial.println("Place finger for first capture.");
  if (!capture(1)) { Serial.println("First capture failed; restart enrollment."); return; }
  Serial.println("Remove finger.");
  const unsigned long start = millis();
  while (sensor.getImage() != FINGERPRINT_NOFINGER) {
    if (millis()-start > 30000) { Serial.println("Removal timed out."); return; }
    delay(100);
  }
  Serial.println("Place the SAME finger for second capture.");
  if (!capture(2) || sensor.createModel() != FINGERPRINT_OK || sensor.storeModel(slot) != FINGERPRINT_OK) {
    Serial.println("Enrollment failed; no successful enrollment confirmation."); return;
  }
  Serial.printf("Enrolled sensor ID %ld. Link this ID to the same worker in BuildTrack, then flash attendance firmware.\n", slot);
}
