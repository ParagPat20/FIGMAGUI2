import serial
import random
import time

# Setup the serial ports
ser_com7 = serial.Serial('COM7', baudrate=115200, timeout=1)

# List to store random numbers
random_numbers_str = ""

# Send random numbers for 3 seconds
start_time = time.time()
while time.time() - start_time < 1:
    random_number = random.randint(1, 100)
    random_numbers_str = str(random_numbers_str) + str(random_number)
    ser_com7.write((str(random_number) + '\n').encode('utf-8'))  # Sending data as bytes with newline
    time.sleep(0.1)  # Quick sending with 10ms delay

# Send "print" after 3 seconds
ser_com7.write("print".encode())
# Compare the list and the received data
print("Sent List of Numbers:")
print(random_numbers_str)


ser_com9 = serial.Serial('COM9', baudrate=115200, timeout=1)
received_data = ser_com9.read_until(b'\n')  # Read until newline
received_str = received_data.decode('utf-8').strip()  # Decode bytes to string and remove any extra whitespace
receivede_data = received_str
print("Received Data:")
print(receivede_data)


time.sleep(0.3)

# Check if the list and received data match
if str(random_numbers_str) == receivede_data:
    print("The list and received data match!")
else:
    print("The list and received data do not match.")
