// First-upload test for a classic DOIT ESP32 DEVKIT V1 and a compatible AS608.
// Sensor TX -> ESP32 GPIO16. Sensor RX <- ESP32 GPIO17. Common GND.
// Check the sensor's own supply voltage and 3.3V UART logic before wiring.
// Serial Monitor: 115200 baud. No Wi-Fi, enrollment, deletion or attendance writes.
#include <Arduino.h>
#include <Adafruit_Fingerprint.h>

#if !defined(CONFIG_IDF_TARGET_ESP32)
#error "This pinout is for a classic ESP32 DevKit V1. Select DOIT ESP32 DEVKIT V1."
#endif

constexpr int SENSOR_RX = 16; // ESP32 receives from sensor TX.
constexpr int SENSOR_TX = 17; // ESP32 transmits to sensor RX.
constexpr uint32_t SENSOR_BAUD = 57600; // Change only if your sensor uses another baud.
constexpr uint32_t SENSOR_PASSWORD = 0x00000000; // Module default, not a website password.
constexpr uint32_t RETRY_MS = 3000;

HardwareSerial sensorSerial(2);
// Stream constructor lets us initialize the UART with explicit pins ourselves.
Adafruit_Fingerprint sensor(static_cast<Stream *>(&sensorSerial), SENSOR_PASSWORD);
bool sensorReady = false;
bool fingerHeld = true; // Require removal at startup and after each attempt.
uint32_t lastConnect = 0;

void printHelp() {
  Serial.println("Commands: r = reconnect, i = sensor info, h = help (then Send).");
  Serial.println("This test never enrolls/deletes fingerprints or records attendance.");
}

void reportError(const char *step, uint8_t code) {
  Serial.printf("%s failed (sensor code 0x%02X).\n", step, code);
  if (code == FINGERPRINT_PACKETRECIEVEERR) {
    sensorReady = false;
    fingerHeld = true;
    lastConnect = millis();
    Serial.println("Communication lost. Check power, common GND and crossed TX/RX.");
  } else {
    Serial.println("Lift your finger completely, then try again.");
  }
}

bool printSensorInfo() {
  uint8_t result = sensor.getParameters();
  if (result != FINGERPRINT_OK) {
    reportError("Read parameters", result);
    return false;
  }
  if (sensor.capacity == 0) {
    Serial.println("Sensor reported zero capacity. Check its protocol compatibility.");
    return false;
  }
  result = sensor.getTemplateCount();
  if (result != FINGERPRINT_OK) {
    reportError("Read template count", result);
    return false;
  }
  Serial.printf("Capacity: %u | Stored fingerprints: %u | Security level: %u\n",
                sensor.capacity, sensor.templateCount, sensor.security_level);
  if (sensor.templateCount == 0) {
    Serial.println("No stored fingerprints yet. Image capture can still be tested.");
    Serial.println("Use attendance.ino and BuildTrack Admin to enroll workers later.");
  }
  return true;
}

void connectSensor() {
  sensorReady = false;
  fingerHeld = true;
  // Drain leftover bytes before a fresh handshake; never change sensor settings.
  while (sensorSerial.available()) sensorSerial.read();
  Serial.printf("Checking AS608: RX=%d TX=%d baud=%lu...\n",
                SENSOR_RX, SENSOR_TX, static_cast<unsigned long>(SENSOR_BAUD));
  if (!sensor.verifyPassword()) {
    Serial.println("No valid sensor response. Check power, TX/RX, baud and sensor password.");
    Serial.println("Retrying in 3 seconds. Power off before changing wires.");
  } else if (printSensorInfo()) {
    sensorReady = true;
    Serial.println("AS608 connected. Remove your finger, then place it on the scanner.");
  }
  lastConnect = millis();
}

void handleCommands() {
  while (Serial.available()) {
    const char command = static_cast<char>(Serial.read());
    if (command == '\r' || command == '\n' || command == ' ') continue;
    if (command == 'r' || command == 'R') connectSensor();
    else if (command == 'h' || command == 'H') printHelp();
    else if (command == 'i' || command == 'I') {
      if (!sensorReady) Serial.println("Sensor is not connected yet. Send r to retry now.");
      else if (!printSensorInfo()) {
        sensorReady = false;
        fingerHeld = true;
        lastConnect = millis();
      }
    } else Serial.println("Unknown command. Send h for help.");
  }
}

void setup() {
  Serial.begin(115200);
  sensorSerial.begin(SENSOR_BAUD, SERIAL_8N1, SENSOR_RX, SENSOR_TX);
  delay(1200); // Allow the sensor to boot; no indefinite wait for Serial Monitor.
  Serial.println("\nBuildTrack AS608 connection test - ESP32 DevKit V1");
  printHelp();
  connectSensor();
}

void loop() {
  handleCommands();
  if (!sensorReady) {
    if (millis() - lastConnect >= RETRY_MS) connectSensor();
    delay(25);
    return;
  }

  const uint8_t image = sensor.getImage();
  if (image == FINGERPRINT_NOFINGER) {
    if (fingerHeld) Serial.println("Ready: place a finger.");
    fingerHeld = false;
    delay(100);
    return;
  }
  if (image == FINGERPRINT_PACKETRECIEVEERR) {
    reportError("Capture", image);
    return;
  }
  if (fingerHeld) { delay(100); return; }
  fingerHeld = true;
  if (image != FINGERPRINT_OK) { reportError("Capture", image); return; }

  Serial.println("Fingerprint image captured.");
  const uint8_t converted = sensor.image2Tz(1);
  if (converted != FINGERPRINT_OK) { reportError("Extract fingerprint features", converted); return; }
  // Search the capacity reported by this module, rather than a fixed slot range.
  const uint8_t match = sensor.fingerSearch(1);
  if (match == FINGERPRINT_OK) {
    Serial.printf("MATCH: sensor ID %u | confidence score %u (not a percentage).\n",
                  sensor.fingerID, sensor.confidence);
    Serial.println("Local test only; no attendance was sent to BuildTrack.");
  } else if (match == FINGERPRINT_NOTFOUND) {
    Serial.println("Sensor is working; this fingerprint has no stored match.");
  } else {
    reportError("Search", match);
    return;
  }
  Serial.println("Remove your finger before the next scan.");
  delay(100);
}
