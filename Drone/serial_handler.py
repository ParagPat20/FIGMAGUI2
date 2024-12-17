import json
import time
import serial

class DroneSerialHandler:
    def __init__(self, vehicle):
        self.serial_port = None
        self.vehicle = vehicle
        self.connected = False
        
    def process_command(self, command_json):
        """Process incoming command from ESP32"""
        try:
            command = json.loads(command_json)
            
            # Verify command structure
            if not all(key in command for key in ['target', 'cmd_type', 'cmd']):
                return "Invalid command format"
                
            if command['target'] != 'MCU':
                return "Invalid target"
                
            cmd_type = command['cmd_type']
            cmd = command['cmd']
            
            # Handle different command types
            if cmd_type == 'GET':
                if cmd == 'STATE':
                    state = self.vehicle.get_vehicle_state()
                    return json.dumps(state)
                    
            elif cmd_type == 'CMD':
                # Handle various commands
                if cmd == 'ARM':
                    self.vehicle.arm()
                    return "OK"
                    
                elif cmd == 'DISARM':
                    self.vehicle.disarm()
                    return "OK"
                    
                elif cmd.startswith('MODE'):
                    mode = cmd.split()[1]
                    self.vehicle.set_mode(mode)
                    return "OK"
                    
                elif cmd.startswith('TAKEOFF'):
                    alt = float(cmd.split()[1])
                    self.vehicle.takeoff(alt)
                    return "OK"
                    
                elif cmd == 'LAND':
                    self.vehicle.land()
                    return "OK"
                    
                elif cmd.startswith('GOTO'):
                    _, lat, lon, alt = cmd.split()
                    self.vehicle.goto((float(lat), float(lon)), float(alt))
                    return "OK"
                    
                elif cmd.startswith('VEL'):
                    _, vx, vy, vz = cmd.split()
                    self.vehicle.send_ned_velocity(float(vx), float(vy), float(vz))
                    return "OK"
                    
            return "Unknown command"
            
        except Exception as e:
            print(f"Command processing error: {e}")
            return f"Error: {str(e)}"
            
    def start(self, port, baudrate=115200):
        """Start serial communication"""
        try:
            self.serial_port = serial.Serial(port, baudrate)
            self.connected = True
            print("Serial connection established")
            
            while self.connected:
                if self.serial_port.in_waiting:
                    command = self.serial_port.readline().decode().strip()
                    print(f"Received command: {command}")
                    
                    response = self.process_command(command)
                    self.serial_port.write(f"{response}\n".encode())
                    self.serial_port.flush()
                    
                time.sleep(0.01)
                
        except Exception as e:
            print(f"Serial error: {e}")
            self.connected = False
            
    def stop(self):
        """Stop serial communication"""
        self.connected = False
        if self.serial_port and self.serial_port.is_open:
            self.serial_port.close() 