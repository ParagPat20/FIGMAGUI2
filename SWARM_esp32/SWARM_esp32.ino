#include <esp_now.h>
#include <WiFi.h>
#include <ArduinoJson.h>

// MAC addresses of other ESP32 devices
uint8_t mcuMAC[] = { 0xD4, 0x8C, 0x49, 0xC2, 0x05, 0x84 };  // MCU MAC address
uint8_t gcsMAC[] = { 0xA0, 0xB7, 0x65, 0x07, 0x63, 0x74 };  // GCS MAC address
uint8_t cd1MAC[] = { 0xB4, 0x8C, 0x49, 0xC3, 0x05, 0x85 };  // CD1 MAC address
uint8_t cd2MAC[] = { 0xD4, 0x8C, 0x49, 0xC4, 0x05, 0x86 };  // CD2 MAC address
uint8_t cd3MAC[] = { 0xA4, 0x8C, 0x49, 0xC5, 0x05, 0x87 };  // CD3 MAC address

// Array to store multiple peers
uint8_t *peerMACs[] = {
  mcuMAC,  // MCU MAC address
  gcsMAC,  // GCS MAC address
  cd1MAC,  // CD1 MAC address
  cd2MAC,  // CD2 MAC address
  cd3MAC   // CD3 MAC address
};



esp_now_peer_info_t peerInfo;

// Global variable to store sender identity
String senderIdentity = "";

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

void sendHeartbeat() {
  CommandPacket hbPacket;
  hbPacket.S = senderIdentity;  // Sender identity
  hbPacket.T = "GCS";           // Target is GCS
  hbPacket.C = "HB";            // Command type is Heartbeat
  hbPacket.P = "1";             // Payload is 1

  uint8_t *targetMAC = getTargetMAC(hbPacket.T);
  if (targetMAC != nullptr) {
    String serializedData = serializeCommandPacket(hbPacket);
    esp_now_send(targetMAC, (uint8_t *)serializedData.c_str(), serializedData.length());
    Serial.println("Heartbeat sent: " + serializedData);
  } else {
    Serial.println("Invalid target for Heartbeat");
  }
}

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);

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
}

void loop() {
  static unsigned long lastHeartbeat = 0;  // Store the last heartbeat time
  unsigned long currentMillis = millis();

  // Send heartbeat every 2000 milliseconds (2 seconds)
  if (currentMillis - lastHeartbeat >= 2000) {
    sendHeartbeat();
    lastHeartbeat = currentMillis;
  }

  if (Serial.available()) {
    String inputData = Serial.readStringUntil('\n');
    CommandPacket packet;
    parseInputData(inputData, packet);

    // Set the sender field in the packet to the identified sender
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
  Serial.print("Last Packet Send Status: ");
  Serial.println(status == ESP_NOW_SEND_SUCCESS ? "Delivery Success" : "Delivery Fail");
}

void OnDataRecv(const uint8_t *mac, const uint8_t *incomingData, int len) {
  String receivedData = String((char *)incomingData).substring(0, len);
  CommandPacket packet;
  parseInputData(receivedData, packet);

  // Manually format the string without quotes
  String formattedData = "{S:" + packet.S + ",C:" + packet.C + ",P:" + packet.P + "}";

  // Print the formatted string without quotes
  Serial.println(formattedData);
}
