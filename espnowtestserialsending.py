import serial
import time
import threading
import queue

# Set up the serial ports for communication
com_port_send = "COM11"  # COM port for sending data
com_port_receive = "COM12"  # COM port for receiving data

# Open the COM port for sending data
ser_send = serial.Serial(com_port_send, baudrate=115200, timeout=1)

# Open the COM port for receiving data
ser_receive = serial.Serial(com_port_receive, baudrate=115200, timeout=0.1)

# Queue for handling received data
data_queue = queue.Queue()

# Function to send data
def send_data():
    while True:
        data_to_send = "{T:MCU;C:ARM;P:1}\n"
        ser_send.write(data_to_send.encode('utf-8'))  # Send data as bytes
        print(f"Sent: {data_to_send}")
        time.sleep(0.1)  # Sleep for 0.5 seconds before sending again

# Function to read data
def read_data():
    while True:
        if ser_receive.in_waiting > 0:  # Check if data is available
            data = ser_receive.read(ser_receive.in_waiting).decode('utf-8')  # Read available bytes
            print(f"Received: {data}")
        # No sleep here to avoid unnecessary delays

# Start reading data in a separate thread
threading.Thread(target=read_data, daemon=True).start()

if __name__ == "__main__":
    try:
        # Start sending data
        send_data()

    except KeyboardInterrupt:
        print("Program interrupted.")

    finally:
        # Close the serial ports
        ser_send.close()
        ser_receive.close()
        print("Serial ports closed.")
