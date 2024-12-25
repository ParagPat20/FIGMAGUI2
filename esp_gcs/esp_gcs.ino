#include <esp_now.h>
#include <WiFi.h>
#include <ArduinoJson.h>

// MAC addresses of other ESP32 devices
uint8_t mcuMAC[] = {0xD4, 0x8C, 0x49, 0xC2, 0x05, 0x84};   // Replace with MCU's MAC address

esp_now_peer_info_t peerInfo;

// Command structure
struct CommandPacket {
    char sender[4];     // GCS
    char target[4];     // MCU or CL1
    char cmdType[4];    // Command type
    char payload[32];   // Actual payload data
    uint8_t checksum;   // Checksum for validation
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

// Function to get target MAC address
uint8_t* getTargetMAC(const char* target) {
    if (strcmp(target, "MCU") == 0) {
        return mcuMAC;
    } else {
        return nullptr; // Invalid target
    }
}

void setup() {
    Serial.begin(115200);
    delay(1000);  // Add delay to stabilize
    
    WiFi.mode(WIFI_STA);
    delay(100);

    if (esp_now_init() != ESP_OK) {
        Serial.println("Error initializing ESP-NOW");
        return;
    }

    esp_now_register_send_cb(OnDataSent);
    esp_now_register_recv_cb(esp_now_recv_cb_t(OnDataRecv));
    
    // Initialize peer info
    memcpy(peerInfo.peer_addr, mcuMAC, 6);
    peerInfo.channel = 0;  
    peerInfo.encrypt = false;
    
    // Add peer
    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        Serial.println("Failed to add peer MCU");
        return;
    }
    else{
      Serial.println("ADDED MCU PEER");
    }
    
    Serial.println("ESP-GCS Ready");  // Add ready message
}

void handleHeartbeat() {
    Serial.println("OK");
    Serial.flush();
}

void loop() {
    if (Serial.available()) {
        String inputData = Serial.readStringUntil('\n');
        Serial.print("GCS Received: ");
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
            Serial.print("GCS JSON Parse Error: ");
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

        // Handle heartbeat request
        if (strcmp(cmdType, "HB") == 0 && strcmp(cmd, "ping") == 0) {
            handleHeartbeat();
            return;
        }

        // Create command packet
        CommandPacket packet;
        memset(&packet, 0, sizeof(CommandPacket));

        strcpy(packet.sender, "GCS");
        strncpy(packet.target, target, sizeof(packet.target) - 1);
        packet.target[sizeof(packet.target) - 1] = '\0';
        strncpy(packet.cmdType, cmdType, sizeof(packet.cmdType) - 1);
        packet.cmdType[sizeof(packet.cmdType) - 1] = '\0';
        strncpy(packet.payload, cmd, sizeof(packet.payload) - 1);
        packet.payload[sizeof(packet.payload) - 1] = '\0';

        // Calculate and set checksum
        packet.checksum = calculateChecksum(&packet);
        

        // Get target MAC address
        uint8_t* targetMAC = getTargetMAC(target);
        if (targetMAC != nullptr) {
            delay(5);  // Small delay before sending
            // Send packet
            esp_now_send(targetMAC, (uint8_t*)&packet, sizeof(CommandPacket));
            delay(5);  // Small delay after sending
        } else {
            Serial.println("Invalid target specified");
        }
    }
    delay(1);  // Small delay in main loop
}

void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
    Serial.print("Last Packet Send Status: ");
    Serial.println(status == ESP_NOW_SEND_SUCCESS ? "Delivery Success" : "Delivery Fail");
}

void OnDataRecv(const uint8_t *mac, const uint8_t *incomingData, int len) {
    if (len == sizeof(CommandPacket)) {
        CommandPacket* packet = (CommandPacket*)incomingData;
          int rssi = WiFi.RSSI();
          Serial.print("RSSI: ");
          Serial.println(rssi);

        // Verify checksum
        uint8_t calculatedChecksum = calculateChecksum(packet);
        if (calculatedChecksum == packet->checksum) {
            // Create JSON object
            StaticJsonDocument<128> jsonDoc;
            jsonDoc["sender"] = packet->sender;
            jsonDoc["target"] = packet->target;
            jsonDoc["cmdType"] = packet->cmdType;
            jsonDoc["payload"] = packet->payload;

            // Serialize JSON to string and send to Serial
            String jsonString;
            serializeJson(jsonDoc, jsonString);
            Serial.println(jsonString);
        } else {
            Serial.println("Checksum verification failed!");
        }
    }
}
