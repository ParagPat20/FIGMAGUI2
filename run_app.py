import subprocess
import time
import serial
import json
from threading import Thread, Lock
from http.server import HTTPServer, SimpleHTTPRequestHandler
import serial.tools.list_ports
import os
from datetime import datetime

# Get the directory containing run_app.py
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Create logs directory if it doesn't exist
LOGS_DIR = os.path.join(BASE_DIR, 'logs')
os.makedirs(LOGS_DIR, exist_ok=True)

class LogbookManager:
    def __init__(self):
        self.current_log_file = None
        self.log_lock = Lock()
        self.start_new_log()
    
    def start_new_log(self):
        """Start a new log file with current timestamp"""
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        self.current_log_file = os.path.join(LOGS_DIR, f"esp_log_{timestamp}.txt")
        with open(self.current_log_file, 'w') as f:
            f.write(f"=== ESP Terminal Log Started at {timestamp} ===\n")
    
    def log_data(self, data):
        """Log data with timestamp"""
        if not data:
            return
            
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        with self.log_lock:
            try:
                with open(self.current_log_file, 'a') as f:
                    if isinstance(data, list):
                        for line in data:
                            f.write(f"[{timestamp}] {line}\n")
                    else:
                        f.write(f"[{timestamp}] {data}\n")
            except Exception as e:
                print(f"Error writing to log file: {e}")
    
    def get_log_files(self):
        """Get list of all log files"""
        try:
            files = []
            for file in os.listdir(LOGS_DIR):
                if file.startswith("esp_log_") and file.endswith(".txt"):
                    file_path = os.path.join(LOGS_DIR, file)
                    files.append({
                        "name": file,
                        "path": file_path,
                        "size": os.path.getsize(file_path),
                        "date": datetime.fromtimestamp(os.path.getctime(file_path)).strftime("%Y-%m-%d %H:%M:%S")
                    })
            return sorted(files, key=lambda x: x["date"], reverse=True)
        except Exception as e:
            print(f"Error getting log files: {e}")
            return []
    
    def get_log_content(self, file_name):
        """Get content of a specific log file"""
        try:
            file_path = os.path.join(LOGS_DIR, file_name)
            if not os.path.exists(file_path):
                return None
            with open(file_path, 'r') as f:
                return f.read()
        except Exception as e:
            print(f"Error reading log file: {e}")
            return None

def get_esp32_ports():
    """List all available serial ports"""
    print("Scanning for serial ports...")
    ports = []
    for port in serial.tools.list_ports.comports():
        ports.append({
            "port": port.device,
            "description": port.description,
            "hwid": port.hwid,
            "is_esp32": False
        })
    return ports

class DroneSerialHandler(SimpleHTTPRequestHandler):
    serial_port = None
    verified_ports = set()  # Store verified port names
    serial_listener_thread = None
    serial_data = []
    serial_data_lock = Lock()
    logbook_manager = LogbookManager()

    @classmethod
    def start_serial_listener(cls):
        """Start listening on the serial port in a separate thread"""
        if cls.serial_listener_thread and cls.serial_listener_thread.is_alive():
            return

        def listen():
            while True:
                if cls.serial_port and cls.serial_port.is_open:
                    try:
                        line = cls.serial_port.readline().decode().strip()
                        if line:
                            with cls.serial_data_lock:
                                cls.serial_data.append(line)
                                # Log the data
                                cls.logbook_manager.log_data(line)
                    except Exception as e:
                        print(f"Error reading from serial port: {e}")

        cls.serial_listener_thread = Thread(target=listen, daemon=True)
        cls.serial_listener_thread.start()

    def send_cors_headers(self):
        """Add CORS and cache control headers to response"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '86400')  # 24 hours
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
    
    def do_OPTIONS(self):
        """Handle preflight requests"""
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()
    
    def do_GET(self):
        if self.path == '/esp-terminal':
            with DroneSerialHandler.serial_data_lock:
                data = DroneSerialHandler.serial_data.copy()
                DroneSerialHandler.serial_data.clear()
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())
        elif self.path == '/list_logs':
            log_files = DroneSerialHandler.logbook_manager.get_log_files()
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(log_files).encode())
        elif self.path.startswith('/get_log/'):
            file_name = self.path.split('/get_log/')[1]
            log_content = DroneSerialHandler.logbook_manager.get_log_content(file_name)
            if log_content is not None:
                self.send_response(200)
                self.send_header('Content-type', 'text/plain')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(log_content.encode())
            else:
                self.send_error(404, "Log file not found")
        else:
            # Handle API endpoints
            if self.path == '/list_ports':
                try:
                    ports = get_esp32_ports()
                    
                    if not ports:
                        ports = [{
                            "port": port.device,
                            "description": port.description,
                            "hwid": port.hwid,
                            "is_esp32": False
                        } for port in serial.tools.list_ports.comports()]
                    
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps(ports).encode())
                    
                except Exception as e:
                    print(f"Error listing ports: {e}")
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.send_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(e)}).encode())
                return

            # Handle static files
            try:
                # Map the requested path to the actual file path
                if self.path == '/':
                    file_path = os.path.join(BASE_DIR, 'index.html')
                else:
                    # Remove leading slash and join with base directory
                    clean_path = self.path.lstrip('/')
                    file_path = os.path.join(BASE_DIR, clean_path)

                # Validate the path is within BASE_DIR
                if not os.path.abspath(file_path).startswith(BASE_DIR):
                    raise Exception("Invalid path")
                
                # Map file extensions to content types
                content_types = {
                    '.html': 'text/html',
                    '.js': 'application/javascript',
                    '.css': 'text/css',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.ico': 'image/x-icon'
                }
                
                ext = os.path.splitext(file_path)[1]
                
                with open(file_path, 'rb') as f:
                    self.send_response(200)
                    if ext in content_types:
                        self.send_header('Content-type', content_types[ext])
                    self.send_cors_headers()
                    self.end_headers()
                    self.wfile.write(f.read())
                    print(f"Served file: {file_path}")
                    
            except FileNotFoundError:
                print(f"File not found: {self.path}")
                self.send_error(404, f"File not found: {self.path}")
            except Exception as e:
                print(f"Error serving file: {e}")
                self.send_error(500, f"Server error: {str(e)}")

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')  # Read the raw body as a string

        print(f"Received POST request on {self.path} with data: {post_data}")

        if self.path == '/send_command':
            try:
                command = post_data.strip()  # Use the raw command string directly
                
                if not DroneSerialHandler.serial_port or not DroneSerialHandler.serial_port.is_open:
                    raise Exception("Serial port not connected")
                    
                # Add command terminator
                command += "\n"
                DroneSerialHandler.serial_port.write(command.encode())
                DroneSerialHandler.serial_port.flush()
                
                self.send_response(200)
                self.send_header('Content-type', 'text/plain')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok"}).encode())  # Send a simple JSON response
                
            except Exception as e:
                print(f"Command error: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        elif self.path == "/verify_port":
            try:
                data = json.loads(post_data)  # Parse the JSON data
                port = data.get('port')  # Extract the port from POST data
                command = data.get('command')  # Extract the command

                if not port:
                    raise ValueError("Port not specified")

                # Pass the correct port to verify_esp32_response
                is_verified = self.verify_esp32_response(port, command)
                
                if is_verified:
                    DroneSerialHandler.verified_ports.add(port)  # Add to verified ports
                    DroneSerialHandler.start_serial_listener()
                else:
                    if DroneSerialHandler.serial_port:
                        DroneSerialHandler.serial_port.close()
                        DroneSerialHandler.serial_port = None
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                
                response = {
                    "verified": is_verified,
                    "status": "connected" if is_verified else "invalid_device"
                }
                
                self.wfile.write(json.dumps(response).encode())
                print(f"Port verification result: {response}")
                
            except Exception as e:
                print(f"Port verification error: {e}")
                if DroneSerialHandler.serial_port:
                    DroneSerialHandler.serial_port.close()
                    DroneSerialHandler.serial_port = None
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return
        

        # Add more paths as needed
        self.send_error(404)  # If the path is not recognized

    def read_response(self, timeout=1.0):
        """Read response from serial port for query commands"""
        if not DroneSerialHandler.serial_port:
            return {"error": "No serial connection"}
            
        start_time = time.time()
        response = []
        
        while (time.time() - start_time) < timeout:
            if DroneSerialHandler.serial_port.in_waiting:
                line = DroneSerialHandler.serial_port.readline().decode().strip()
                response.append(line)
                if not DroneSerialHandler.serial_port.in_waiting:
                    break
                    
        return {"response": response} if response else {"error": "No response"}
    
    def verify_esp32_response(self, port, command, timeout=1.0):
        try:
            print(f"Attempting to open serial port: {port}")
            # Open the specified port
            DroneSerialHandler.serial_port = serial.Serial(port, 115200)
            
            if not DroneSerialHandler.serial_port.is_open:
                raise Exception("Failed to open serial port")
            
            # Clear buffers
            DroneSerialHandler.serial_port.reset_input_buffer()
            DroneSerialHandler.serial_port.reset_output_buffer()
            
            # Send command
            command += "\n"
            DroneSerialHandler.serial_port.write(command.encode())
            start_time = time.time()
            response_lines = []
            
            print("Waiting for ESP32 response...")
            while (time.time() - start_time) < timeout:
                if DroneSerialHandler.serial_port.in_waiting:
                    line = DroneSerialHandler.serial_port.readline().decode().strip()
                    print(f"Received line: '{line}'")
                    response_lines.append(line)
                    if line == "OK":
                        print("Received OK response - Valid ESP32 GCS device")
                        return True
                    elif "ESP-GCS Ready" in line:
                        print("ESP32 is still initializing...")
            
            print(f"No OK response received. Got: {response_lines}")
            return False
        except Exception as e:
            print(f"Error verifying ESP32 response: {e}")
            return False


def start_http_server():
    try:
        # Change working directory to where run_app.py is located
        os.chdir(BASE_DIR)
        server = HTTPServer(('127.0.0.1', 5000), DroneSerialHandler)
        print(f"HTTP server running on http://127.0.0.1:5000 from {BASE_DIR}")
        server.serve_forever()
    except Exception as e:
        print(f"Failed to start HTTP server: {e}")
        raise

class ApplicationManager:
    def __init__(self):
        self.electron_process = None
        self.running = True

    def start_electron(self):
        """Start Electron application"""
        try:
            users_base_path = r"C:/Users/"
            user_identifier = "LOQ"
            # Use node to run electron directly
            electron_path = os.path.join(users_base_path, user_identifier, r"AppData/Roaming/npm/node_modules/electron/dist/electron.exe")
            main_js_path = os.path.join(BASE_DIR, 'main.js')
            
            if not os.path.exists(electron_path):
                print("Electron not found. Installing...")
                subprocess.run(['npm', 'install', 'electron'], shell=True, check=True)
            
            self.electron_process = subprocess.Popen(
                [electron_path, main_js_path],
                shell=True
            )
            print("Electron app started")
        except Exception as e:
            print(f"Failed to start Electron: {e}")
            self.running = False

    def run(self):
        """Main application entry point"""
        try:
            # Start HTTP server in separate thread
            http_thread = Thread(target=start_http_server)
            http_thread.daemon = True
            http_thread.start()

            # Start Electron in main thread
            self.start_electron()

            # Keep main thread alive
            while self.running:
                if self.electron_process.poll() is not None:
                    print("Electron process ended")
                    break
                time.sleep(0.1)

        except KeyboardInterrupt:
            print("Received shutdown signal")
        finally:
            self.cleanup()

    def cleanup(self):
        """Clean shutdown of all components"""
        self.running = False
        
        if DroneSerialHandler.serial_port and DroneSerialHandler.serial_port.is_open:
            print("Closing serial port...")
            DroneSerialHandler.serial_port.close()
            if DroneSerialHandler.serial_listener_thread:
                DroneSerialHandler.serial_listener_thread.join(timeout=1)
        
        if self.electron_process:
            self.electron_process.terminate()

        print("Application shutdown complete")

def main():
    app = ApplicationManager()
    app.run()

if __name__ == "__main__":
    main()