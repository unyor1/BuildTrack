#pragma once
// Copy to config.h (gitignored). Never put the database service-role key on a device.
constexpr char WIFI_SSID[] = "YOUR_WIFI";
constexpr char WIFI_PASSWORD[] = "YOUR_WIFI_PASSWORD";
constexpr char ATTENDANCE_URL[] = "https://ruimjlhsfpaezkgfphsz.supabase.co/functions/v1/biometric-attendance";
constexpr char ENROLLMENT_URL[] = "https://ruimjlhsfpaezkgfphsz.supabase.co/functions/v1/biometric-enrollment";
constexpr char DEVICE_ID[] = "COPY_DEVICE_UUID_FROM_ADMIN";
constexpr char DEVICE_TOKEN[] = "COPY_64_CHARACTER_DEVICE_TOKEN_FROM_ADMIN";
// ESP32 DevKit example pins only. Confirm your exact board/module datasheets first.
constexpr int SENSOR_RX = 16; // ESP32 RX <- sensor TX
constexpr int SENSOR_TX = 17; // ESP32 TX -> sensor RX
constexpr unsigned long SENSOR_BAUD = 57600; // Verify your module's configured baud rate.
// Select explicit attendance direction: open/high=IN, grounded/low=OUT.
// Use a maintained two-position switch and clear physical IN/OUT signage.
constexpr int DIRECTION_PIN = 25;
// Paste the VERIFIED root CA for the HTTPS endpoint's current certificate chain.
// Obtain from its CA's official website; do NOT bypass validation with setInsecure().
constexpr char ROOT_CA[] = R"PEM(
PASTE_VERIFIED_ROOT_CA_PEM_HERE
)PEM";
