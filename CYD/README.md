codex resume 0199ce4b-eb8a-7e90-ae4a-8e7272fc544a

# CYD DDR Song Viewer

Starter firmware for the ESP32 "Cheap Yellow Display" (ESP32-2432S028R) that connects to Wi-Fi, pulls DDR jacket art from https://ddr.rtfoy.co.uk/, and shows basic song information.

## Features
- Wi-Fi STA connection with configurable credentials (`include/secrets.h`).
- Jacket artwork download (cached in SPIFFS) and PNG decoding via `PNGdec`.
- Portrait layout with a bottom metadata panel (title, artist, BPM range, song length) that cycles through three example songs.
- Full-width jacket rendering with nearest-neighbour scaling and caching on SPIFFS.
- Designed for the built-in 320×240 ILI9341 display and backlight on GPIO21.

## Getting Started
1. **Install dependencies**
   - PlatformIO CLI or the VS Code extension.
   - ESP32 board drivers/USB-to-UART driver for your OS.
2. **Configure Wi-Fi**
   - Inside `CYD/` copy `include/secrets.example.h` to `include/secrets.h`.
   - Update the SSID and password in `include/secrets.h`.
3. **Flash the firmware**
   - Connect the CYD over USB.
   - From the `CYD/` directory run `pio run --target upload` to build and flash.
   - Optional: monitor serial logs with `pio device monitor -b 115200`.
4. **Usage**
   - On boot the display shows a splash screen, joins Wi-Fi, fetches jackets, and rotates the curated song list every 15 seconds.
   - Jackets are cached under `/jacket-<songId>.png` in SPIFFS. Erase the filesystem (e.g. `pio run --target erase`) to force a refresh.

## Customising
- Edit `kSongs` in `src/main.cpp` to add or swap tracks; keep each `jacketPath` URL encoded relative to the site root.
- Adjust `kLoopDelayMs` to control how long each song remains on screen.
- Tweak `showSongMetadata` for alternate layouts or extra stats.

## Notes
- The `huge_app.csv` partition table reserves ~1 MB for SPIFFS, enough for several ~500 KB PNG jackets. Expand it if you need more cache space.
- Jacket art is scaled to fit the screen width while preserving aspect ratio (no cropping).
- If you prefer the Arduino IDE, select **ESP32 Dev Module** with the **Huge App (3MB No OTA/1MB SPIFFS)** partition scheme.
