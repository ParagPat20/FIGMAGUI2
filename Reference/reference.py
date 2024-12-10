import json
import logging
import os
import platform
import subprocess
import threading
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
import serial
import serial.tools.list_ports

from image_handler import processing_complete

# Define the base directory as the directory where this script is located
base_dir = os.path.dirname(__file__)
web_dir = os.path.join(base_dir, "static")  # Define `static` folder path


class CustomHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # If the requested path is '/home', serve `index.html` from the `static` folder
        if path == "/home":
            return os.path.join(web_dir, "index.html")

        # For all other paths, serve files from `web_dir` (static folder)
        return os.path.join(web_dir, path.lstrip("/"))

    def send_no_cache_headers(self):
        self.send_header(
            "Cache-Control", "no-store, no-cache, must-revalidate, max-age=0"
        )
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Access-Control-Allow-Origin", "*")

    def do_GET(self):
        if self.path == "processing_complete":
            try:
                # Check if processing is complete by checking the event
                if processing_complete.is_set():
                    self.send_response(200)
                    self.send_no_cache_headers()
                    self.end_headers()
                else:
                    self.send_response(404)
                    self.send_no_cache_headers()
                    self.end_headers()
            except Exception as e:
                self.send_response(500)
                self.send_no_cache_headers()
                self.end_headers()
                self.wfile.write(str(e).encode())
            return

        # For db.json and image requests, prevent caching
        if (
            self.path.endswith(".json")
            or self.path.endswith(".png")
            or self.path.endswith(".jpg")
        ):
            self.send_response(200)
            self.send_no_cache_headers()
            with open(self.translate_path(self.path), "rb") as f:
                content = f.read()
            self.end_headers()
            self.wfile.write(content)
            return

        # Use default GET behavior with the updated `translate_path` for other paths
        super().do_GET()

    def do_POST(self):
        if self.path == "/delete_processing_flag":
            try:
                processing_complete.clear()
                self.send_response(200)
                self.end_headers()
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode())
            return

        content_length = int(self.headers["Content-Length"])
        post_data = self.rfile.read(content_length)

        # Handling focus-in and focus-out events
        if self.path == "/focus-in":
            if platform.system() != "Windows":
                threading.Thread(
                    target=self.execute_shell_script, args=("keyboardstart.sh",)
                ).start()
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"Focus-in event received, running keyboardstart.sh")
            else:
                self.send_response(200)
                self.end_headers()
                self.wfile.write(
                    b"Focus-in event received, but keyboard functionality is disabled on Windows."
                )

        elif self.path == "/focus-out":
            if platform.system() != "Windows":
                threading.Thread(
                    target=self.execute_shell_script, args=("keyboardstop.sh",)
                ).start()
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"Focus-out event received, running keyboardstop.sh")
            else:
                self.send_response(200)
                self.end_headers()
                self.wfile.write(
                    b"Focus-out event received, but keyboard functionality is disabled on Windows."
                )

        elif self.path == "/shutdown":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Server shutting down...")
            print("Shutting down the server...")
            httpd.shutdown()  # Graceful shutdown of the server
            os._exit(0)

        elif self.path == "/addIngredient":
            self.add_ingredient(post_data)

        elif self.path == "/addCocktail":
            self.add_cocktail(post_data)

        elif self.path == "/send-pipes":
            self.handle_send_pipes(post_data)
            return
        
        elif self.path == "/save-config":
            self.save_config(post_data)

        else:
            self.send_response(404)
            self.end_headers()

    def execute_shell_script(self, script_name):
        # Run scripts from the same directory as the Python script
        script_path = os.path.join(base_dir, script_name)
        if platform.system() == "Windows":
            subprocess.Popen(["cmd", "/c", script_path])
        elif platform.system() == "Linux":
            subprocess.Popen(["sh", script_path])
        else:
            print(f"Unsupported operating system for script execution.")
    def save_config(self, post_data):
        try:
            config_data = json.loads(post_data)
            config_path = os.path.join(web_dir, "config.json")
            print(post_data)

            # Write the configuration data to config.json
            with open(config_path, "w") as file:
                json.dump(config_data, file, indent=2)

            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Config saved successfully")
        except Exception as e:
            print(f"Error saving config: {e}")
            self.send_response(500)
            self.end_headers()
            self.wfile.write(b"Error saving config")
            
    def add_cocktail(self, post_data):
        try:
            products_path = os.path.join(web_dir, "products.json")
            print("Starting to add cocktail")
            if not os.path.exists(products_path):
                print(f"products.json not found at {products_path}")
                self.send_response(500)
                self.end_headers()
                self.wfile.write(b"Error: products.json file not found")
                return

            # Load existing cocktails from products.json
            with open(products_path, "r") as file:
                file_content = file.read()
                if not file_content:
                    cocktails = []
                else:
                    cocktails = json.loads(file_content)

            # Parse the new cocktail data
            new_cocktail = json.loads(post_data)

            # Append the new cocktail to the existing data
            cocktails.append(new_cocktail)

            # Write the updated data back to products.json
            with open(os.path.join(web_dir, "products.json"), "w") as file:
                json.dump(cocktails, file, indent=2)

            # Send success response immediately after saving JSON
            self.send_response(201)
            self.end_headers()
            self.wfile.write(b"Cocktail added successfully")
            print("Cocktail added successfully")
        except Exception as e:
            print(f"Error adding cocktail: {e}")
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f"Error saving cocktail: {str(e)}".encode())

    def add_ingredient(self, post_data):
        try:
            # Reset the completion event before starting
            print("Processing new ingredient request")

            # Validate post data
            try:
                new_ingredient = json.loads(post_data)
                print(f"Received ingredient data: {new_ingredient}")
            except json.JSONDecodeError as je:
                print(f"Invalid POST data format: {str(je)}")
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"Invalid ingredient data format")
                return

            # Load existing ingredients from db.json
            db_path = os.path.join(web_dir, "db.json")
            if not os.path.exists(db_path):
                print(f"db.json not found at {db_path}")
                self.send_response(500)
                self.end_headers()
                self.wfile.write(b"Error: db.json file not found")
                return

            with open(db_path, "r") as file:
                file_content = file.read()
                if not file_content:
                    data = []
                else:
                    data = json.loads(file_content)

            # Parse the new ingredient data
            new_ingredient = json.loads(post_data)

            # Append the new ingredient to the existing data
            if not isinstance(data, list):
                data = []
            data.append(new_ingredient)

            # Write the updated data back to db.json
            with open(os.path.join(web_dir, "db.json"), "w") as file:
                json.dump(data, file, indent=2)

                # Wait for image processing to complete (with timeout)
                self.send_response(201)
                self.end_headers()
                self.wfile.write(b"Ingredient added successfully")

        except Exception as e:
            print(f"Error adding ingredient: {e}")  # Log the error to the console
            self.send_response(500)  # Internal Server Error
            self.end_headers()
            self.wfile.write(f"Error saving ingredient: {str(e)}".encode())

    def handle_send_pipes(self, post_data):
        # Parse the incoming data
        assigned_pipes = json.loads(post_data)

        # Send data to serial output and get the response
        response = self.send_to_serial_output(assigned_pipes)

        if response == "OK":
            # Respond back to the client with 'OK'
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"OK")  # Send 'OK' response back to JavaScript
        else:
            # If there was an error, respond with the error message
            self.send_response(500)  # Internal Server Error
            self.end_headers()
            self.wfile.write(
                response.encode()
            )  # Send the error message back to JavaScript

    def send_to_serial_output(self, assigned_pipes):
        # Find the appropriate serial port
        port = None
        available_ports = serial.tools.list_ports.comports()

        # Check for available ports and set the appropriate one
        for p in available_ports:
            if p.device == "/dev/ttyACM0" or p.device == "/dev/ttyUSB0":
                port = p.device
                break  # Exit the loop once we find a suitable port

        if port is None:
            print("No suitable serial port found.")
            return "Error: No suitable serial port found"

        try:
            with serial.Serial(port, 9600, timeout=5) as ser:
                for ingredient, pipe in assigned_pipes.items():
                    message = f"{ingredient}: {pipe}\n"
                    print(f"Sending to serial: {message.strip()}")
                    ser.write(message.encode("utf-8"))

                return "OK"  # Indicate successful sending
        except serial.SerialException as e:
            error_message = f"Serial error: {str(e)}"
            print(error_message)
            return error_message  # Return the error message for the frontend
        except Exception as e:
            error_message = f"Error sending to serial output: {str(e)}"
            print(error_message)
            return error_message  # Return the error message for the frontend


def start_http_server():
    global httpd
    httpd = HTTPServer(("127.0.0.1", 5000), CustomHandler)
    print("HTTP server running on http://127.0.0.1:5000")
    httpd.serve_forever()


def start_electron_app():
    time.sleep(2)
    os.environ["DISPLAY"] = ":0"

    # Define the base path to check for "karan" or "LOQ"
    users_base_path = r"C:/Users/"

    # Initialize user_identifier and path for Electron executable
    user_identifier = None
    electron_executable = None

    # Check for "karan" or "LOQ" in the C:\Users\ directory
    if os.path.exists(os.path.join(users_base_path, "karan")):
        user_identifier = "karan"
    elif os.path.exists(os.path.join(users_base_path, "LOQ")):
        user_identifier = "LOQ"

    if user_identifier is None:
        print("Neither 'karan' nor 'LOQ' directories found in C:\\Users\\")
        return  # Exit if neither directory is found

    print(f"User  Identifier: {user_identifier}")

    # Set the path for the Electron executable based on the platform
    if platform.system() == "Windows":
        electron_executable = os.path.join(users_base_path, user_identifier, r"AppData/Roaming/npm/node_modules/electron/dist/electron.exe")
    elif platform.system() == "Linux":
        electron_executable = "/usr/local/bin/electron"
    else:
        raise EnvironmentError("Unsupported operating system")

    # Disable caching by adding the --no-cache flag to the Electron process
    electron_process = subprocess.Popen(
        [
            electron_executable,
            os.path.join(web_dir, "main.js"),
        ]
    )
    electron_process.communicate()

def start_image_handler():
    """Start the image handler script in a separate thread."""
    subprocess.Popen(["python", os.path.join(base_dir, "image_handler.py")])


if __name__ == "__main__":
    # Start the HTTP server in a separate thread
    http_thread = threading.Thread(target=start_http_server)
    http_thread.start()

    start_image_handler()

    # Start the Electron app after a slight delay to ensure the server is up
    start_electron_app()
