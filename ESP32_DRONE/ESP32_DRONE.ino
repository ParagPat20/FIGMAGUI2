#include <esp_now.h>
#include <WiFi.h>
#include <ArduinoJson.h>
#include <Adafruit_NeoPixel.h>

// Define LED strip parameters
#define LED_PIN 32
#define LED_COUNT 90

// Create NeoPixel object
Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

// LED animation variables
unsigned long previousMillis = 0;
int rainbowIndex = 0;
int chaseIndex = 0;
bool isRainbowActive = false;
bool isChaseActive = false;
uint32_t currentColor = strip.Color(0, 0, 0);

// MAC addresses of other ESP32 devices
uint8_t gcsMAC[] = { 0x08, 0xF9, 0xE0, 0x9F, 0x24, 0x20 };  // GCS MAC address
uint8_t mcuMAC[] = { 0xD4, 0x8C, 0x49, 0xC2, 0x05, 0x84 };  // MCU MAC address
uint8_t cd1MAC[] = { 0x94, 0x54, 0xC5, 0x4D, 0xBC, 0xEC };  // CD1 MAC address
uint8_t cd2MAC[] = { 0xC0, 0x5D, 0x89, 0xB0, 0x18, 0xBC };  // CD2 MAC address
uint8_t cd3MAC[] = { 0xA0, 0xB7, 0x65, 0x07, 0x63, 0x74 };  // CD3 MAC address
uint8_t cd4MAC[] = { 0x14, 0x2B, 0x2F, 0xD9, 0xFD, 0xB4 };  // CD4 MAC address

// Array to store multiple peers
uint8_t *peerMACs[] = {
  mcuMAC,  // MCU MAC address
  gcsMAC,  // GCS MAC address
  cd1MAC,  // CD1 MAC address
  cd2MAC,  // CD2 MAC address
  cd3MAC,  // CD3 MAC address
  cd4MAC
};

esp_now_peer_info_t peerInfo;

// Global variable to store sender identity
String senderIdentity = "";

// Counter for failed transmissions
int failedTransmissionCount = 0;

// Command structure
struct CommandPacket {
  String S;  // GCS or other sender
  String T;  // MCU or CL1
  String C;  // Command type (e.g., "ARM", "LAUNCH")
  String P;  // Actual payload data
};

// Function to get target MAC address
uint8_t *getTargetMAC(const String &target) {
  if (target == "MCU") {
    return mcuMAC;
  } else if (target == "GCS") {
    return gcsMAC;
  } else if (target == "CD1") {
    return cd1MAC;
  } else if (target == "CD2") {
    return cd2MAC;
  } else if (target == "CD3") {
    return cd3MAC;
  } else if (target == "CD4") {
    return cd4MAC;
  } else {
    return nullptr;  // Invalid target
  }
}

// Function to add peers
void addPeers() {
  for (int i = 0; i < sizeof(peerMACs) / sizeof(peerMACs[0]); i++) {
    memcpy(peerInfo.peer_addr, peerMACs[i], 6);
    peerInfo.channel = 0;
    peerInfo.encrypt = false;

    // Add peer
    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
      Serial.print("Failed to add peer ");
      Serial.println(i + 1);  // Print the peer number (1-based)
    } else {
      Serial.print("Peer ");
      Serial.print(i + 1);  // Print the peer number (1-based)
      Serial.println(" added successfully");
    }
  }
}

// Function to compare MAC address and set sender field
String getSenderBasedOnMAC() {
  uint8_t mac[6];
  WiFi.macAddress(mac);

  // Compare MAC addresses with predefined ones and set sender
  if (memcmp(mac, mcuMAC, 6) == 0) {
    return "MCU";
  } else if (memcmp(mac, gcsMAC, 6) == 0) {
    return "GCS";
  } else if (memcmp(mac, cd1MAC, 6) == 0) {
    return "CD1";
  } else if (memcmp(mac, cd2MAC, 6) == 0) {
    return "CD2";
  } else if (memcmp(mac, cd3MAC, 6) == 0) {
    return "CD3";
  } else if (memcmp(mac, cd4MAC, 6) == 0) {
    return "CD4";
  } else {
    return "UNKNOWN";  // In case the MAC address doesn't match any predefined ones
  }
}

// Function to parse input data
void parseInputData(const String &inputData, CommandPacket &packet) {
  String data = inputData;
  data.replace("{", "");  // Remove opening brace
  data.replace("}", "");  // Remove closing brace
  data.trim();            // Remove leading and trailing spaces

  // Split the input string into key-value pairs
  int start = 0;
  while (start < data.length()) {
    int colonIndex = data.indexOf(':', start);
    int semicolonIndex = data.indexOf(';', start);

    // If no colon is found, break (invalid input)
    if (colonIndex == -1) break;

    // Extract key and value
    String key = data.substring(start, colonIndex);
    String value = data.substring(colonIndex + 1, (semicolonIndex == -1) ? data.length() : semicolonIndex);

    // Trim spaces from key and value
    key.trim();
    value.trim();

    // Map keys to CommandPacket fields
    if (key == "S") {
      packet.S = value;
    } else if (key == "T") {
      packet.T = value;
    } else if (key == "C") {
      packet.C = value;
    } else if (key == "P") {
      packet.P = value;
    }

    // Move to the next key-value pair
    start = (semicolonIndex == -1) ? data.length() : semicolonIndex + 1;
  }
}

// Function to serialize the CommandPacket
String serializeCommandPacket(const CommandPacket &packet) {
  String serialized = "{S:" + packet.S + ";T:" + packet.T + ";C:" + packet.C;
  if (!packet.P.isEmpty()) {
    serialized += ";P:" + packet.P;
  }
  serialized += "}";
  return serialized;
}

// Function to update rainbow effect without delays
void updateRainbow() {
  if (!isRainbowActive) return;
  
  unsigned long currentMillis = millis();
  if (currentMillis - previousMillis >= 20) {  // Update every 20ms
    previousMillis = currentMillis;
    for (int i = 0; i < strip.numPixels(); i++) {
      int pixelHue = (i * 65536L / strip.numPixels() + rainbowIndex) & 65535;
      strip.setPixelColor(i, strip.gamma32(strip.ColorHSV(pixelHue)));
    }
    strip.show();  // Ensure this is non-blocking
    rainbowIndex += 256;
  }
}

// Function to update chase effect without delays
void updateChase() {
  if (!isChaseActive) return;
  
  unsigned long currentMillis = millis();
  if (currentMillis - previousMillis >= 30) {  // Update every 30ms
    previousMillis = currentMillis;
    strip.clear();
    
    // Create 3-LED chase
    strip.setPixelColor(chaseIndex, strip.Color(0, 0, 255));
    if (chaseIndex > 0) strip.setPixelColor(chaseIndex-1, strip.Color(0, 0, 128));
    if (chaseIndex > 1) strip.setPixelColor(chaseIndex-2, strip.Color(0, 0, 64));
    
    strip.show();  // Ensure this is non-blocking
    chaseIndex++;
    if (chaseIndex >= strip.numPixels()) chaseIndex = 0;
  }
}

// Function to set solid color
void setSolidColor(uint32_t color) {
  isRainbowActive = false;
  isChaseActive = false;
  currentColor = color;
  for (int i = 0; i < strip.numPixels(); i++) {
    strip.setPixelColor(i, color);
  }
  strip.show();
}

// Timer for temporary mode display
unsigned long modeChangeMillis = 0;
bool isModeChangeActive = false;

// Function to handle temporary mode display
void handleModeChange() {
  if (isModeChangeActive && millis() - modeChangeMillis >= 2000) {  // 2 seconds
    isModeChangeActive = false;
    // Resume previous mode
    if (isRainbowActive) {
      updateRainbow();
    } else if (isChaseActive) {
      updateChase();
    }
  }
}

// Function to set solid color temporarily
void setSolidColorTemporary(uint32_t color) {
  isModeChangeActive = true;
  modeChangeMillis = millis();
  for (int i = 0; i < strip.numPixels(); i++) {
    strip.setPixelColor(i, color);
  }
  strip.show();
}

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);

  // Initialize LED strip
  strip.begin();
  strip.setBrightness(50);  // Set to 50% brightness
  strip.show();

  if (esp_now_init() != ESP_OK) {
    Serial.println("Error initializing ESP-NOW");
    return;
  }

  esp_now_register_send_cb(OnDataSent);
  esp_now_register_recv_cb(esp_now_recv_cb_t(OnDataRecv));

  // Add peers
  addPeers();

  // Set sender identity based on the MAC address
  senderIdentity = getSenderBasedOnMAC();
  Serial.print("ESP-NOW Ready for ");
  Serial.println(senderIdentity);

  // Start rainbow effect
  isRainbowActive = true;
  
  // Schedule chase effect after 4 seconds
  previousMillis = millis();
}

void loop() {
  // Handle LED animations
  if (!isModeChangeActive) {
    if (isRainbowActive) {
      updateRainbow();
    } else if (isChaseActive) {
      updateChase();
    }
  } else {
    handleModeChange();
  }

  // Check if it's time to start chase effect (after 4 seconds)
  if (millis() - previousMillis >= 4000 && isRainbowActive) {
    isRainbowActive = false;
    isChaseActive = true;
    chaseIndex = 0;
  }

  // Handle serial input
  if (Serial.available()) {
    String inputData = Serial.readStringUntil('\n');
    CommandPacket packet;
    parseInputData(inputData, packet);

    packet.S = senderIdentity;
    uint8_t *targetMAC = getTargetMAC(packet.T);
    if (targetMAC != nullptr) {
      String serializedData = serializeCommandPacket(packet);
      esp_now_send(targetMAC, (uint8_t *)serializedData.c_str(), serializedData.length());
    } else {
      Serial.println("Invalid target specified");
    }
  }
}

void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  if (status == ESP_NOW_SEND_SUCCESS) {
    Serial.println("DLOK");
    failedTransmissionCount = 0; // Reset counter on successful transmission
  } else {
    Serial.println("DLFAIL");
    failedTransmissionCount++;
    
    if (failedTransmissionCount >= 5) {
      CommandPacket landPacket;
      landPacket.S = senderIdentity;
      landPacket.C = "LAND";
      landPacket.P = "1";
      String serializedData = serializeCommandPacket(landPacket);
      Serial.println(serializedData);
      failedTransmissionCount = 0; // Reset counter after sending LAND command
    }
  }
}

void OnDataRecv(const uint8_t *mac, const uint8_t *incomingData, int len) {
  String receivedData = String((char *)incomingData).substring(0, len);
  CommandPacket packet;
  parseInputData(receivedData, packet);

  // Handle LED colors based on commands
  if (packet.C == "ARM") {
    setSolidColorTemporary(strip.Color(0, 255, 0));  // Green for ARM
  } else if (packet.C == "LAND") {
    setSolidColorTemporary(strip.Color(255, 0, 0));  // Red for LAND
  } else if (packet.C == "LAUNCH") {
    setSolidColorTemporary(strip.Color(0, 0, 255));  // Blue for LAUNCH
  } else if (packet.C == "DISARM") {
    setSolidColorTemporary(strip.Color(255, 255, 0));  // Yellow for DISARM
  } else if (packet.C == "NED") {
    // Set first 10 and last 10 LEDs to Orange for NED temporarily
    uint32_t color = strip.Color(255, 165, 0);  // Orange
    for (int i = 0; i < 10; i++) {
      strip.setPixelColor(i, color);
    }
    for (int i = strip.numPixels() - 10; i < strip.numPixels(); i++) {
      strip.setPixelColor(i, color);
    }
    strip.show();
    
    // Set a timer for 2 seconds
    isModeChangeActive = true;
    modeChangeMillis = millis();
  } else if (packet.C == "YAW") {
    setSolidColorTemporary(strip.Color(128, 0, 128));  // Purple for YAW
  } else if (packet.C == "SET_MODE") {
    if (packet.P == "FLIP") {
      setSolidColorTemporary(strip.Color(255, 20, 147));  // Pink for FLIP
    } else {
      setSolidColorTemporary(strip.Color(0, 255, 255));  // Cyan for other modes
    }
  } else if (packet.C == "MTL") {
    setSolidColorTemporary(strip.Color(75, 0, 130));  // Indigo for MTL
  } else if (packet.C == "POS") {
    setSolidColorTemporary(strip.Color(255, 69, 0));  // Red-Orange for POS
  } else if (packet.C == "LIGHT") {
    if (packet.P == "rnbw") {
      isRainbowActive = true;
      isChaseActive = false;
    } else if (packet.P == "chase") {
      isRainbowActive = false;
      isChaseActive = true;
    } else {
      // Convert hex color code to RGB
      long number = strtol(packet.P.c_str(), NULL, 16);
      uint8_t r = (number >> 16) & 0xFF;
      uint8_t g = (number >> 8) & 0xFF;
      uint8_t b = number & 0xFF;
      setSolidColor(strip.Color(r, g, b));  // Set the color permanently
    }
  } else {
    setSolidColorTemporary(strip.Color(255, 255, 255));  // White for unknown commands
  }

  // Print the formatted string
  String formattedData = "{S:" + packet.S + ";T:" + packet.T + ";C:" + packet.C + ";P:" + packet.P + "}";
  Serial.println(formattedData);
}
