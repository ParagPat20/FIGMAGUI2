#include <esp_now.h>
#include <WiFi.h>
#include <ArduinoJson.h>

// MAC address of the devices
uint8_t gcsMAC[] = {0xA0, 0xB7, 0x65, 0x07, 0x63, 0x74};     // Replace with actual MAC address

esp_now_peer_info_t peerInfo;

// Command structure
struct CommandPacket {
    char sender[4];
    char target[4];
    char cmdType[4];
    char payload[32];
    uint8_t checksum;
};

// Function to calculate checksum
uint8_t calculateChecksum(CommandPacket* packet) {
    uint8_t checksum = 0;
    uint8_t* data = (uint8_t*)packet;
    for (int i = 0; i < sizeof(CommandPacket) - 1; i++) {
        checksum ^= data[i];
    }
    return checksum;
}

// Get the MAC address based on the target field
uint8_t* getMACAddress(const char* target) {
    if (strcmp(target, "GCS") == 0) {
        return gcsMAC;
    }
    return nullptr;
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
    memcpy(peerInfo.peer_addr, gcsMAC, 6);
    peerInfo.channel = 0;
    peerInfo.encrypt = false;
    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        Serial.println("Failed to add peer GCS");
    }
    else {
      Serial.println("ADDED GCS PEER");
    }

    Serial.println("ESP-MCU Ready");  // Add ready message
}

void loop() {
    if (Serial.available()) {
        String inputData = Serial.readStringUntil('\n');
        Serial.print("MCU Received: ");
        Serial.println(inputData);

        // Parse JSON input
        StaticJsonDocument<256> jsonDoc;
        jsonDoc.clear();
        
        // First check if input is valid JSON
        if (inputData.length() == 0) {
            Serial.println("Empty input");
            return;
        }

        DeserializationError error = deserializeJson(jsonDoc, inputData);

        if (error) {
            Serial.print("MCU JSON Parse Error: ");
            Serial.println(error.c_str());
            Serial.println("Error parsing JSON");
            return;
        }

        // Extract data from JSON
        const char* target = jsonDoc["target"];
        const char* cmdType = jsonDoc["cmd_type"];
        const char* cmd = jsonDoc["cmd"];

        // Validate all required fields are present
        if (!jsonDoc.containsKey("target") || !jsonDoc.containsKey("cmd_type") || !jsonDoc.containsKey("cmd")) {
            Serial.println("Missing required JSON fields");
            return;
        }
        
        // Validate pointers
        if (!target || !cmdType || !cmd) {
            Serial.println("Invalid JSON field values");
            return;
        }

        Serial.print("Target: "); Serial.println(target);
        Serial.print("Command Type: "); Serial.println(cmdType);
        Serial.print("Command: "); Serial.println(cmd);

        if (target && cmdType && cmd) {
            // Create command packet
            CommandPacket packet;
            memset(&packet, 0, sizeof(CommandPacket));

            strcpy(packet.sender, "MCU");
            strncpy(packet.target, target, sizeof(packet.target) - 1);
            packet.target[sizeof(packet.target) - 1] = '\0';
            strncpy(packet.cmdType, cmdType, sizeof(packet.cmdType) - 1);
            packet.cmdType[sizeof(packet.cmdType) - 1] = '\0';
            strncpy(packet.payload, cmd, sizeof(packet.payload) - 1);
            packet.payload[sizeof(packet.payload) - 1] = '\0';

            // Calculate and set checksum
            packet.checksum = calculateChecksum(&packet);

            // Get the MAC address for the target
            uint8_t* targetMAC = getMACAddress(target);
            if (targetMAC != nullptr) {
                delay(5);  // Small delay before sending
                // Send packet
                esp_now_send(targetMAC, (uint8_t*)&packet, sizeof(CommandPacket));
                delay(5);  // Small delay after sending
                Serial.println("MCU: ESP-NOW packet sent");
            } else {
                Serial.println("MCU: Invalid target specified");
            }
        } else {
            Serial.println("MCU: Missing fields in JSON");
        }
    }
    delay(1);  // Small delay in main loop
}

void OnDataSent(const uint8_t* mac_addr, esp_now_send_status_t status) {
    Serial.print("Last Packet Send Status: ");
    Serial.println(status == ESP_NOW_SEND_SUCCESS ? "Delivery Success" : "Delivery Fail");
}

void OnDataRecv(const uint8_t* mac, const uint8_t* incomingData, int len) {
    if (len == sizeof(CommandPacket)) {
        CommandPacket* packet = (CommandPacket*)incomingData;
          int rssi = WiFi.RSSI();
          Serial.print("RSSI: ");
          Serial.println(rssi);

        // Verify checksum
        uint8_t calculatedChecksum = calculateChecksum(packet);
        if (calculatedChecksum == packet->checksum) {
            // Create JSON object with proper initialization
            StaticJsonDocument<128> jsonDoc;
            jsonDoc.clear();
            jsonDoc["sender"] = packet->sender;
            jsonDoc["target"] = packet->target;
            jsonDoc["cmdType"] = packet->cmdType;
            jsonDoc["payload"] = packet->payload;

            String jsonString;
            serializeJson(jsonDoc, jsonString);
            Serial.println(jsonString);
        } else {
            Serial.println("Checksum verification failed!");
        }
    }
}
