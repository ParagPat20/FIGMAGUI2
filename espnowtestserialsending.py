import serial
import time
import json

# Define the serial port and baud rate
serial_port = 'COM11'
baud_rate = 115200  # Adjust the baud rate as needed

# Create a serial connection
try:
    ser = serial.Serial(serial_port, baud_rate, timeout=1)
    print(f"Connected to {serial_port} at {baud_rate} baud.")
except serial.SerialException as e:
    print(f"Error opening serial port: {e}")
    exit()

# Define the message template
message_template = {
    "target": "MCU",
    "cmd_type": "CMD",
    "cmd": None  # Placeholder for the counter
}

# Initialize the counter
counter = 0

# Continuously send the message
try:
    while True:
        # Update the message with the current counter value
        message_template["cmd"] = str(counter) 
        
        # Convert the message to a JSON string
        json_message = json.dumps(message_template)
        
        # Send the message over the serial port
        ser.write((json_message + '\n').encode('utf-8'))  # Add newline for better readability
        
        # Print the sent message
        print(f"Sent: {json_message}")
        
        # Increment the counter
        counter += 1
        
        # Wait for a short period before sending the next message
        time.sleep(1)  # Adjust the delay as needed

except KeyboardInterrupt:
    print("Stopped by user.")

finally:
    # Close the serial connection
    ser.close()
    print("Serial port closed.")