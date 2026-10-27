# ESP32 DevKit V1 + AS608: first upload

## New single-file upload (after the scanner test works)

### Current update: scan confirmations and safe time parsing (October 27)

Upload **`private_upload/buildtrack_as608/buildtrack_as608.ino`**, not `led.ino`, an unsaved sketch, or the connection test. Both this standalone sketch and the public reference have the safe timestamp parser. The standalone version includes your saved private settings; it needs no separate header.

1. Open that exact `.ino` file in Arduino IDE.
2. Select **DOIT ESP32 DEVKIT V1** and the board's USB COM port (last detected as **COM5**).
3. Close Serial Monitor, click **Upload**, and hold **BOOT** only if it stays at Connecting; release once writing starts.
4. Do **not** enable Erase All Flash. Existing sensor templates and pending-event storage must be preserved.
5. Reopen Serial Monitor at **115200**. Use the Admin registration steps for enrollment, and the project's attendance screen for scan acknowledgements.

`biometric-attendance` v3 and the scan-notices database migration are now live. The local firmware has been compiled, not remotely flashed. Test physically: registered finger, duplicate scan within your saved repeat window, an unregistered finger, and reconnect after a short network loss. Keep the attendance screen open to see queued pop-ups. Do not change a real worker's attendance just to test IN/OUT; use an approved test worker or normal arrival/departure.

Your saved project schedule is authoritative. Automatic IN/OUT alternates after the repeat window; an extra scan after that window is not treated as a duplicate. An unregistered finger report is best-effort; the terminal retains only one pending matched attendance scan, not an unlimited offline queue.

Open **`private_upload/buildtrack_as608/buildtrack_as608.ino`** directly in Arduino IDE. This local, Git-ignored file includes the saved Wi-Fi/device settings and the verified public HTTPS root CAs from `tls-root-ca.pem` (fixed 2026-10-27: the earlier single GlobalSign ECC R4 root never matched the server, so the device could not connect). No `config.h` or `config.example.h` file is needed with this sketch. It uses the same Admin-controlled enrollment and attendance workflow described below.

Use **DOIT ESP32 DEVKIT V1**, the board's USB port (COM5 when last detected), and Serial Monitor at **115200**. Close the old `led.ino` or unsaved sketch so you upload the intended file. Treat the entire new sketch as private because it contains credentials. It is a standalone snapshot; later edits to `attendance.ino` or `attendance/config.h` do not automatically update it.

## Setup checked on October 27, 2026

- Board reported by you: **ESP32 DevKit V1** (classic ESP32, not S3/C3).
- Arduino IDE and bundled Arduino CLI 1.4.1 are installed.
- Espressif's **esp32 3.3.7** board package is installed, including **DOIT ESP32 DEVKIT V1**.
- ArduinoJson **7.4.3** is installed for the BuildTrack attendance sketch.
- Adafruit Fingerprint Sensor Library **2.1.4** was missing and has now been installed.
- At the time of the check, Windows listed only COM3 and COM4 Bluetooth serial ports. Neither was identified as an ESP32 USB connection.
- `attendance/config.h` has not been configured. Your existing cloud firmware still needs private Wi-Fi/device credentials and a verified HTTPS root CA.
- Physical wiring, module supply voltage and an actual sensor response have not been verified remotely.

## 1. Wire with power disconnected

Use the printed pin labels or your seller's module datasheet, **not cable colors**. These GPIO numbers match both supplied sketches for your DevKit V1:

| AS608 pin | ESP32 DevKit V1 connection |
| --- | --- |
| TX / TXD (sensor output) | GPIO16 / RX2 |
| RX / RXD (sensor input) | GPIO17 / TX2 |
| GND | GND (common ground) |
| VCC | The supply voltage specified for your exact AS608 module |

If the sensor datasheet says **3.3 V supply**, use the board's **3V3** pin with adequate current available. Do not choose 5 V just because the board has VIN/5V. A module that requires a different supply must be powered accordingly; its UART connection must still be safe for the ESP32's 3.3 V logic. Never feed a 5 V TX signal directly into GPIO16. Leave extra touch/wake wires unconnected unless the supplier documentation requires them.

GPIO16/17 here assume the classic DevKit V1/WROOM board. Do not reuse this pinout unverified on a WROVER/PSRAM board, ESP32-S3 or ESP32-C3.

## 2. Make the board appear in Arduino IDE

1. Connect the DevKit with a **USB data cable**. A charge-only cable may light the power LED without creating a serial port.
2. In Windows Device Manager, inspect **Ports (COM & LPT)**. Unplug/reconnect the board to identify its USB serial COM port. Do not select the Bluetooth COM3/COM4 entries merely because they exist.
3. If there is an unknown USB device, identify its USB-to-serial chip before installing a driver. Some boards use CP210x, others CH340/CH341. Use the matching manufacturer's driver, not an arbitrary driver bundle.
4. In Arduino IDE choose **Tools > Board > esp32 > DOIT ESP32 DEVKIT V1**, then select the board's actual port. Use **115200** upload speed if available. The core is already installed; you do not need to reinstall it.

## 3. Upload the connection test first

Open **`connection_test/connection_test.ino`** in Arduino IDE. Click **Verify**, then **Upload**.

If upload stays at Connecting, hold **BOOT**, start Upload, and release BOOT once writing begins. Close any other program using the COM port. If needed, press **EN/RESET** after upload.

Open **Tools > Serial Monitor**, set **115200 baud**, then press EN/RESET to see startup messages. The scanner UART separately uses **57600 baud** in the sketch; do not set the monitor to 57600.

Expected startup after a successful handshake:

```text
BuildTrack AS608 connection test - ESP32 DevKit V1
Checking AS608: RX=16 TX=17 baud=57600...
Capacity: ... | Stored fingerprints: ... | Security level: ...
AS608 connected. Remove your finger, then place it on the scanner.
Ready: place a finger.
```

Place a finger after the Ready message. A new sensor can capture an image and report **no stored match**; that is normal before enrollment. A previously enrolled finger reports its sensor ID and a match score. Lift between scans. The score is not a percentage.

Serial Monitor commands: `r` reconnects, `i` prints capacity/template count, `h` prints help. The sketch retries a failed connection every three seconds. It never enrolls, deletes or uploads fingerprints, modifies sensor settings, or records attendance.

If it cannot connect: turn off power, recheck common ground, cross TX/RX as shown, check the sensor's rated supply, confirm its configured baud and password, and confirm compatibility with the Adafruit packet protocol. An illuminated sensor alone does not establish UART communication.

## 4. Connect it to BuildTrack after the hardware test passes

1. Open **Admin > Biometric Registration > Devices** and register the terminal for the correct project. Copy the device UUID and one-time device token privately.
2. Copy **`attendance/config.example.h`** to **`attendance/config.h`** beside `attendance.ino`. Fill Wi-Fi SSID/password, device UUID/token and the verified endpoint root CA. Keep the existing project endpoint URLs. The private file is gitignored. Never use a database service-role key or paste credentials into chat.
3. The DevKit V1 uses 2.4 GHz Wi-Fi. For a phone hotspot, enable 2.4 GHz compatibility. The cloud sketch needs internet and time synchronization; the connection-test sketch needs neither.
4. No IN/OUT switch is used since 2026-10-27: the server decides Time IN / Time OUT and ignores repeat scans (see README step 7). Flash this firmware only after migration `20261027130000_attendance_schedule_scans` is applied and `biometric-attendance` is redeployed; do not connect anything to GPIO25.
5. Open **`attendance/attendance.ino`**, Verify and Upload. Without a private configuration it compiles but stops with setup instructions. See `README.md` for credential/certificate and pending-event recovery requirements.
6. In Admin, save the worker and their portrait, select this device (**Scanner online**), then click **Register fingerprint** and confirm the worker is at the scanner. Follow the prompts on the website (or the Serial Monitor): place finger, lift, place the same finger again, then once more to confirm. The website assigns the ID; you do not type a slot number.
7. Wait for **Fingerprint registered and confirmed**. Open the project's attendance screen. Remove the finger, scan again, and wait for **Attendance recorded by database** before treating the scan as recorded.

The test sketch and attendance sketch replace each other on upload; they do not run simultaneously. Fingerprint templates remain in the sensor. Avoid Arduino's Erase All Flash option on an attendance terminal with pending events because it can remove the ESP32's pending-event storage. The legacy `enroll/enroll.ino` is not needed for this workflow and can overwrite sensor slots.

## Verification limits

Both the connection-test and attendance sketches **compiled successfully** for `esp32:esp32:esp32doit-devkit-v1` using the installed ESP32 core 3.3.7. Compile results are recorded in [the hardware audit](../../docs/audits/2026-10-27-esp32-as608-setup.md). Compilation does not test the wiring, sensor protocol, enrollment, Wi-Fi, TLS connection or live attendance. No firmware was uploaded and no attendance or enrollment record was created during this setup check.

## Official references

- [Espressif UART API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/serial.html): explicit UART RX/TX configuration.
- [Adafruit fingerprint library 2.1.4](https://github.com/adafruit/Adafruit-Fingerprint-Sensor-Library/tree/2.1.4): sensor commands used by these sketches.
- [Adafruit wiring guide](https://learn.adafruit.com/adafruit-optical-fingerprint-sensor/wiring-for-use-with-arduino): sensor variants have different wiring/supply requirements; this is not a datasheet for your unidentified AS608 module.
- [Silicon Labs CP210x drivers](https://www.silabs.com/developer-tools/usb-to-uart-bridge-vcp-drivers) and [WCH CH340/CH341 driver](https://www.wch-ic.com/downloads/CH341SER_EXE.html): use only the one matching the actual USB serial chip.
