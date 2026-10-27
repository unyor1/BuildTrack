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
// Not used since 2026-10-27: the server decides Time IN / Time OUT. Kept so older settings still compile.
constexpr int DIRECTION_PIN = 25;
// Paste the VERIFIED root CAs for the HTTPS endpoint's current certificate chain: the whole of
// hardware/esp32-as608/tls-root-ca.pem (GTS Root R4, GTS Root R1, GlobalSign Root CA; checked 2026-10-27).
// Not "GlobalSign ECC Root CA - R4": the server does not chain to it and every request fails with HTTP -1.
// Obtain from its CA's official website; do NOT bypass validation with setInsecure().
constexpr char ROOT_CA[] = R"PEM(
PASTE_VERIFIED_ROOT_CA_PEM_HERE
)PEM";
