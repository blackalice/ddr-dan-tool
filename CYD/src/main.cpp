#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <SPIFFS.h>
#include <TFT_eSPI.h>
#include <PNGdec.h>
#include <algorithm>
#include <memory>
#include <new>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

struct SongInfo {
  const char *id;
  const char *title;
  const char *artist;
  uint16_t bpmMin;
  uint16_t bpmMax;
  uint16_t lengthSeconds;
  const char *jacketPath; // URL encoded path relative to kBaseUrl
};

static constexpr const char *kBaseUrl = "https://ddr.rtfoy.co.uk/";
static constexpr SongInfo kSongs[] = {
    {"000001", "ACROSS WORLD", "Royz", 185, 185, 106, "sm/2013/ACROSS%20WORLD/ACROSS%20WORLD-jacket.png"},
    {"001092", "A", "D.J.Amuro", 93, 186, 128, "sm/EX/A/A-jacket.png"},
    {"000492", "ACE FOR ACES", "TAG", 150, 150, 112, "sm/A/ACE%20FOR%20ACES/ACE%20FOR%20ACES-jacket.png"},
};
static constexpr size_t kSongCount = sizeof(kSongs) / sizeof(SongInfo);
static constexpr uint16_t kTextAreaHeight = 108;
static constexpr uint16_t kLoopDelayMs = 15000;
static constexpr uint32_t kDownloadTimeoutMs = 20000;

TFT_eSPI tft = TFT_eSPI();
PNG png;
File pngFile;

struct PngDrawContext {
  TFT_eSPI *display;
  int16_t originX;
  int16_t originY;
  int16_t targetWidth;
  int16_t targetHeight;
  int16_t srcWidth;
  int16_t srcHeight;
  uint16_t *lineBuffer;
  uint16_t *scaledLine;
  int16_t *xLookup;
};

void *pngOpenCallback(const char *filename, int32_t *size) {
  pngFile = SPIFFS.open(filename, FILE_READ);
  if (!pngFile) {
    return nullptr;
  }
  *size = static_cast<int32_t>(pngFile.size());
  return static_cast<void *>(&pngFile);
}

void pngCloseCallback(void *handle) {
  if (handle == nullptr) {
    return;
  }
  auto *file = static_cast<File *>(handle);
  if (*file) {
    file->close();
  }
}

int32_t pngReadCallback(PNGFILE *pngFileHandle, uint8_t *buffer, int32_t length) {
  if (pngFileHandle == nullptr || buffer == nullptr) {
    return 0;
  }
  auto *file = static_cast<File *>(pngFileHandle->fHandle);
  if (file == nullptr) {
    return 0;
  }
  return static_cast<int32_t>(file->read(buffer, length));
}

int32_t pngSeekCallback(PNGFILE *pngFileHandle, int32_t position) {
  if (pngFileHandle == nullptr) {
    return -1;
  }
  auto *file = static_cast<File *>(pngFileHandle->fHandle);
  if (file == nullptr) {
    return -1;
  }
  return file->seek(position) ? position : -1;
}

int pngDrawCallback(PNGDRAW *pDraw) {
  if (pDraw == nullptr || pDraw->pUser == nullptr) {
    return 0;
  }
  auto *ctx = static_cast<PngDrawContext *>(pDraw->pUser);
  if (ctx->targetWidth <= 0 || ctx->targetHeight <= 0) {
    return 1;
  }

  png.getLineAsRGB565(pDraw, ctx->lineBuffer, PNG_RGB565_LITTLE_ENDIAN, 0x000000);

  for (int16_t x = 0; x < ctx->targetWidth; ++x) {
    const int16_t srcIndex = ctx->xLookup[x];
    ctx->scaledLine[x] = ctx->lineBuffer[srcIndex];
  }

  const int32_t yStartScaled = static_cast<int32_t>(pDraw->y) * ctx->targetHeight;
  const int32_t yEndScaled = static_cast<int32_t>(pDraw->y + 1) * ctx->targetHeight;
  int16_t destStart = static_cast<int16_t>(yStartScaled / ctx->srcHeight);
  int16_t destEnd = static_cast<int16_t>(yEndScaled / ctx->srcHeight);
  if (destEnd <= destStart) {
    destEnd = destStart + 1;
  }
  if (destStart < 0) {
    destStart = 0;
  }
  if (destEnd > ctx->targetHeight) {
    destEnd = ctx->targetHeight;
  }

  for (int16_t dest = destStart; dest < destEnd; ++dest) {
    const int16_t screenY = ctx->originY + dest;
    ctx->display->pushImage(ctx->originX, screenY, ctx->targetWidth, 1, ctx->scaledLine);
  }
  return 1;
}

void setBacklight(bool enabled) {
#ifdef TFT_BL
  pinMode(TFT_BL, OUTPUT);
#ifdef TFT_BACKLIGHT_ON
  constexpr int activeLevel = TFT_BACKLIGHT_ON;
#else
  constexpr int activeLevel = HIGH;
#endif
  const int inactiveLevel = (activeLevel == HIGH) ? LOW : HIGH;
  digitalWrite(TFT_BL, enabled ? activeLevel : inactiveLevel);
#else
  (void)enabled;
#endif
}

void drawCenteredString(const String &text, int16_t y, uint8_t font, uint16_t color) {
  tft.setTextColor(color, TFT_BLACK);
  tft.setTextFont(font);
  tft.setTextDatum(MC_DATUM);
  tft.drawString(text, tft.width() / 2, y);
  tft.setTextDatum(TL_DATUM);
}

bool connectToWiFi(uint32_t timeoutMs) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const uint32_t start = millis();
  Serial.printf("Connecting to WiFi SSID '%s'...\n", WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < timeoutMs) {
    delay(200);
    Serial.print('.');
  }
  Serial.println();
  return WiFi.status() == WL_CONNECTED;
}

bool ensureCacheCapacity(size_t requiredBytes, const String &preservePath) {
  size_t total = SPIFFS.totalBytes();
  size_t used = SPIFFS.usedBytes();
  size_t free = (total > used) ? (total - used) : 0;
  if (free >= requiredBytes) {
    return true;
  }

  File root = SPIFFS.open("/");
  if (!root) {
    Serial.println("Failed to open SPIFFS root for cleanup");
    return false;
  }
  while (free < requiredBytes) {
    File entry = root.openNextFile();
    if (!entry) {
      break;
    }
    String path = entry.path();
    size_t size = entry.size();
    entry.close();
    if (path == preservePath) {
      continue;
    }
    if (!path.startsWith("/jacket-")) {
      continue;
    }
    if (SPIFFS.exists(path) && SPIFFS.remove(path)) {
      Serial.printf("Removing cached jacket %s (%u bytes) to free space\n", path.c_str(), static_cast<unsigned>(size));
      used = SPIFFS.usedBytes();
      free = (total > used) ? (total - used) : 0;
    }
  }
  root.close();
  return free >= requiredBytes;
}

bool downloadImageToFlash(const String &url, const String &destPath) {
  HTTPClient http;
  http.setTimeout(kDownloadTimeoutMs);
  if (!http.begin(url)) {
    Serial.printf("HTTP begin failed for %s\n", url.c_str());
    return false;
  }
  const int httpCode = http.GET();
  if (httpCode != HTTP_CODE_OK) {
    Serial.printf("HTTP GET failed (%d) for %s\n", httpCode, url.c_str());
    http.end();
    return false;
  }
  const int contentLength = http.getSize();
  const size_t targetBytes = (contentLength > 0) ? static_cast<size_t>(contentLength) : static_cast<size_t>(600000);
  if (!ensureCacheCapacity(targetBytes, destPath)) {
    Serial.println("Not enough SPIFFS space even after cleanup");
    http.end();
    return false;
  }
  if (SPIFFS.exists(destPath)) {
    SPIFFS.remove(destPath);
  }
  File out = SPIFFS.open(destPath, FILE_WRITE);
  if (!out) {
    Serial.printf("Failed to open %s for write\n", destPath.c_str());
    http.end();
    return false;
  }

  WiFiClient *stream = http.getStreamPtr();
  if (stream == nullptr) {
    Serial.println("HTTP stream unavailable");
    out.close();
    http.end();
    SPIFFS.remove(destPath);
    return false;
  }

  constexpr size_t kDownloadBufferSize = 2048;
  uint8_t buffer[kDownloadBufferSize];
  size_t totalWritten = 0;
  const size_t expectedBytes = (contentLength > 0) ? static_cast<size_t>(contentLength) : 0;

  while (http.connected()) {
    int available = stream->available();
    if (available <= 0) {
      if (expectedBytes > 0 && totalWritten >= expectedBytes) {
        break;
      }
      delay(1);
      continue;
    }

    size_t toRead = static_cast<size_t>(available);
    if (expectedBytes > 0) {
      size_t remaining = expectedBytes - totalWritten;
      if (remaining == 0) {
        break;
      }
      if (toRead > remaining) {
        toRead = remaining;
      }
    }
    if (toRead > kDownloadBufferSize) {
      toRead = kDownloadBufferSize;
    }

    int read = stream->readBytes(buffer, toRead);
    if (read <= 0) {
      break;
    }

    size_t written = out.write(buffer, static_cast<size_t>(read));
    if (written != static_cast<size_t>(read)) {
      Serial.printf("SPIFFS write failed after %u bytes\n", static_cast<unsigned>(totalWritten));
      out.close();
      http.end();
      SPIFFS.remove(destPath);
      return false;
    }
    totalWritten += written;
    if (expectedBytes > 0 && totalWritten >= expectedBytes) {
      break;
    }
  }

  out.close();
  http.end();

  if (expectedBytes > 0 && totalWritten != expectedBytes) {
    Serial.printf("Download size mismatch for %s (expected %d, got %u)\n", destPath.c_str(), contentLength, static_cast<unsigned>(totalWritten));
    SPIFFS.remove(destPath);
    return false;
  }
  if (totalWritten == 0) {
    Serial.printf("No data received for %s\n", destPath.c_str());
    SPIFFS.remove(destPath);
    return false;
  }

  Serial.printf("Saved %s (%u bytes)\n", destPath.c_str(), static_cast<unsigned>(totalWritten));
  return true;
}

String secondsToTime(uint16_t seconds) {
  const uint16_t minutes = seconds / 60;
  const uint16_t remaining = seconds % 60;
  char buffer[6];
  snprintf(buffer, sizeof(buffer), "%u:%02u", minutes, remaining);
  return String(buffer);
}

void showSongMetadata(const SongInfo &song) {
  const int16_t metaY = tft.height() - kTextAreaHeight;
  tft.fillRect(0, metaY, tft.width(), kTextAreaHeight, TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextWrap(false);
  tft.setCursor(8, metaY + 8);
  tft.setTextFont(4);
  tft.printf("%s\n", song.title);
  tft.setTextFont(2);
  tft.printf("by %s\n", song.artist);
  tft.setTextFont(2);
  if (song.bpmMin == song.bpmMax) {
    tft.printf("BPM: %u\n", song.bpmMin);
  } else {
    tft.printf("BPM: %u-%u\n", song.bpmMin, song.bpmMax);
  }
  tft.printf("Length: %s\n", secondsToTime(song.lengthSeconds).c_str());
}

void showStatusMessage(const String &message, uint16_t color) {
  const int16_t artAreaHeight = tft.height() - kTextAreaHeight;
  tft.fillRect(0, 0, tft.width(), artAreaHeight, TFT_BLACK);
  drawCenteredString(message, artAreaHeight / 2, 2, color);
}

bool displaySongArtwork(const SongInfo &song) {
  const int16_t artAreaY = 0;
  const int16_t artAreaHeight = tft.height() - kTextAreaHeight;
  const int16_t artAreaWidth = tft.width();
  if (artAreaHeight <= 0 || artAreaWidth <= 0) {
    Serial.println("Art area size invalid");
    return false;
  }
  const String localPath = String("/jacket-") + song.id + ".png";
  const String imageUrl = String(kBaseUrl) + song.jacketPath;

  if (!SPIFFS.exists(localPath)) {
    showStatusMessage("Fetching jacket...", TFT_YELLOW);
    Serial.printf("Downloading jacket for %s from %s\n", song.title, imageUrl.c_str());
    if (!downloadImageToFlash(imageUrl, localPath)) {
      showStatusMessage("Download failed", TFT_RED);
      Serial.println("Download failed");
      return false;
    }
  } else {
    File cached = SPIFFS.open(localPath, FILE_READ);
    if (cached) {
      uint8_t header[8] = {0};
      size_t headerLen = cached.read(header, sizeof(header));
      Serial.printf("Cached jacket %s (%u bytes) header=%02X %02X %02X %02X %02X %02X %02X %02X\n",
                    localPath.c_str(), static_cast<unsigned>(cached.size()),
                    headerLen > 0 ? header[0] : 0, headerLen > 1 ? header[1] : 0,
                    headerLen > 2 ? header[2] : 0, headerLen > 3 ? header[3] : 0,
                    headerLen > 4 ? header[4] : 0, headerLen > 5 ? header[5] : 0,
                    headerLen > 6 ? header[6] : 0, headerLen > 7 ? header[7] : 0);
      cached.close();
    } else {
      Serial.printf("Failed to open cached jacket %s\n", localPath.c_str());
    }
  }

  const int openResult = png.open(localPath.c_str(), pngOpenCallback, pngCloseCallback, pngReadCallback, pngSeekCallback, pngDrawCallback);
  if (openResult != PNG_SUCCESS) {
    showStatusMessage("PNG open failed", TFT_RED);
    Serial.printf("PNG open failed (%d) for %s\n", openResult, localPath.c_str());
    SPIFFS.remove(localPath);
    return false;
  }

  const int imageWidth = png.getWidth();
  const int imageHeight = png.getHeight();
  Serial.printf("PNG info: %dx%d bpp=%d type=%d\n", imageWidth, imageHeight, png.getBpp(), png.getPixelType());
  std::unique_ptr<uint16_t[]> lineBuffer(new (std::nothrow) uint16_t[imageWidth]);
  if (!lineBuffer) {
    png.close();
    showStatusMessage("No RAM for art", TFT_RED);
    Serial.println("Failed to allocate line buffer");
    return false;
  }

  int32_t scaleX = ((int32_t)artAreaWidth << 16) / std::max(1, imageWidth);
  int32_t scaleY = ((int32_t)artAreaHeight << 16) / std::max(1, imageHeight);
  int32_t scale = std::min(scaleX, scaleY);
  if (scale <= 0) {
    scale = 1 << 16;
  }
  int16_t targetWidth = static_cast<int16_t>((static_cast<int64_t>(imageWidth) * scale + 0x7FFF) >> 16);
  int16_t targetHeight = static_cast<int16_t>((static_cast<int64_t>(imageHeight) * scale + 0x7FFF) >> 16);
  if (targetWidth < 1) {
    targetWidth = 1;
  } else if (targetWidth > artAreaWidth) {
    targetWidth = artAreaWidth;
  }
  if (targetHeight < 1) {
    targetHeight = 1;
  } else if (targetHeight > artAreaHeight) {
    targetHeight = artAreaHeight;
  }

  std::unique_ptr<uint16_t[]> scaledLine(new (std::nothrow) uint16_t[targetWidth]);
  std::unique_ptr<int16_t[]> xLookup(new (std::nothrow) int16_t[targetWidth]);
  if (!scaledLine || !xLookup) {
    png.close();
    showStatusMessage("No RAM for scaling", TFT_RED);
    Serial.println("Failed to allocate scaling buffers");
    return false;
  }

  const int32_t denom = (targetWidth > 0) ? targetWidth : 1;
  for (int16_t x = 0; x < targetWidth; ++x) {
    int32_t src = (static_cast<int32_t>(x) * imageWidth + denom / 2) / denom;
    if (src >= imageWidth) {
      src = imageWidth - 1;
    }
    xLookup[x] = static_cast<int16_t>(src);
  }

  int16_t originX = (artAreaWidth - targetWidth) / 2;
  if (originX < 0) {
    originX = 0;
  }
  int16_t originY = artAreaY + (artAreaHeight - targetHeight) / 2;
  if (originY < artAreaY) {
    originY = artAreaY;
  }

  PngDrawContext ctx{
      .display = &tft,
      .originX = originX,
      .originY = originY,
      .targetWidth = targetWidth,
      .targetHeight = targetHeight,
      .srcWidth = static_cast<int16_t>(imageWidth),
      .srcHeight = static_cast<int16_t>(imageHeight),
      .lineBuffer = lineBuffer.get(),
      .scaledLine = scaledLine.get(),
      .xLookup = xLookup.get(),
  };

  tft.fillRect(0, artAreaY, artAreaWidth, artAreaHeight, TFT_BLACK);
  const int decodeResult = png.decode(&ctx, 0);
  png.close();

  if (decodeResult != PNG_SUCCESS) {
    showStatusMessage("Decode failed", TFT_RED);
    Serial.printf("PNG decode failed (%d) for %s (last error=%d)\n", decodeResult, localPath.c_str(), png.getLastError());
    SPIFFS.remove(localPath);
    return false;
  }

  Serial.printf("Displayed %s (%dx%d)\n", song.title, targetWidth, targetHeight);

  return true;
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println(F("CYD DDR Song Viewer boot"));
  Serial.printf("Free heap: %u bytes\n", static_cast<unsigned>(ESP.getFreeHeap()));
  tft.begin();
  tft.setRotation(0);
  tft.setSwapBytes(true);
  setBacklight(true);
  tft.fillScreen(TFT_BLACK);
  drawCenteredString("CYD DDR Viewer", tft.height() / 2, 4, TFT_CYAN);

  if (!SPIFFS.begin(true)) {
    drawCenteredString("SPIFFS failed", tft.height() / 2 + 30, 2, TFT_RED);
    Serial.println("SPIFFS mount failed");
    while (true) {
      delay(1000);
    }
  }
  Serial.printf("SPIFFS total=%u used=%u\n", static_cast<unsigned>(SPIFFS.totalBytes()), static_cast<unsigned>(SPIFFS.usedBytes()));

  if (!connectToWiFi(20000)) {
    drawCenteredString("WiFi failed", tft.height() / 2 + 50, 2, TFT_RED);
    Serial.println("WiFi connection failed");
    while (true) {
      delay(1000);
    }
  }
  Serial.print("WiFi connected with IP: ");
  Serial.println(WiFi.localIP());

  tft.fillScreen(TFT_BLACK);
}

void loop() {
  static size_t index = 0;
  const SongInfo &song = kSongs[index];
  Serial.printf("Displaying %s by %s\n", song.title, song.artist);
  showSongMetadata(song);
  if (!displaySongArtwork(song)) {
    delay(kLoopDelayMs);
    index = (index + 1) % kSongCount;
    return;
  }
  delay(kLoopDelayMs);
  index = (index + 1) % kSongCount;
}
