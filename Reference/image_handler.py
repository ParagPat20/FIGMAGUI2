import json
import os
import base64
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import time
import threading

# Define the base directory as the directory where this script is located
base_dir = os.path.dirname(__file__)
web_dir = os.path.join(base_dir, "static")  # Define `static` folder path
img_dir = os.path.join(web_dir, "img")  # Path to the img directory
uplaod_dir = os.path.join(img_dir, "upload") # Path to the upload directory
db_file_path = os.path.join(web_dir, "db.json")  # Path to db.json
products_file_path = os.path.join(web_dir, "products.json")  # Path to products.json

# Create a global completion event that will be imported by app.py
processing_complete = threading.Event()

class JsonChangeHandler(FileSystemEventHandler):
    def __init__(self):
        self.is_processing = False  # Flag to prevent re-entrance
        
    def process_json(self, file_path, type_):
        self.is_processing = True  # Set the flag to indicate processing has started
        processing_complete.clear()  # Reset the completion event
        try:
            with open(file_path, "r") as file:
                data = json.load(file)

            # Track if any changes are made
            changes_made = False
            
            if type_ == "ingredient":
                # Process ingredients from db.json
                for ingredient in data:
                    if "ING_IMG" in ingredient and ingredient["ING_IMG"]:
                        original_img = ingredient["ING_IMG"]
                        save_image(ingredient, "ingredient")
                        if ingredient["ING_IMG"] != original_img:
                            changes_made = True
            else:
                # Process products from products.json
                for product in data:
                    if "PImage" in product and product["PImage"]:
                        original_img = product["PImage"]
                        save_image(product, "product")
                        if product["PImage"] != original_img:
                            changes_made = True

            # Save the updated file only if changes were made
            if changes_made:
                with open(file_path, "w") as file:
                    json.dump(data, file, indent=2)

        except Exception as e:
            print(f"Error processing {db_file_path}: {e}")
        finally:
            self.is_processing = False  # Reset the flag after processing
            processing_complete.set()  # Set the completion event


    def on_modified(self, event):
        if event.src_path == db_file_path and not self.is_processing:
            print(f"{db_file_path} has been modified.")
            self.process_json(db_file_path, "ingredient")
            
        elif event.src_path == products_file_path and not self.is_processing:
            print(f"{products_file_path} has been modified.")
            self.process_json(products_file_path, "product")

def save_image(item, type_):
    # Create processing flag file
    with open(os.path.join(web_dir, 'processing'), 'w') as f:
        f.write('1')
        
    if type_ == "ingredient":
        img_data = item.get("ING_IMG")
        name = item.get("ING_Name")
        img_key = "ING_IMG"
    else:
        img_data = item.get("PImage")
        name = item.get("PName")
        img_key = "PImage"
    
    # Check if the image data is in Base64 format
    if img_data and 'base64,' in img_data:
        print(f"Processing Base64 image data for {name}: {img_data}")
        try:
            # Extract the Base64 part
            header, encoded = img_data.split(',', 1)
            extension = header.split(';')[0].split('/')[1]  # Get the image type

            # Create a filename based on the name and extension
            filename = f"{name.replace(' ', '_').lower()}.{extension}"
            file_path = os.path.join(uplaod_dir, filename)

            # Write the image to a file
            with open(file_path, "wb") as img_file:
                img_file.write(base64.b64decode(encoded))
            
            # Update the item's image path
            item[img_key] = f"/img/upload/{filename}"

            print(f"Image saved at: {file_path}")
            
            # Remove processing flag file after successful save
            flag_path = os.path.join(web_dir, 'processing')
            if os.path.exists(flag_path):
                os.remove(flag_path)
        except Exception as e:
            print(f"Error saving image for {name}: {e}")

    # Check if the image data is a file path
    elif img_data and img_data.startswith("/img/upload/"):
        print(f"Image already formatted for {name}: {img_data}")

# Start watching for changes in db.json
def start_watching():
    event_handler = JsonChangeHandler()
    observer = Observer()
    observer.schedule(event_handler, path=web_dir, recursive=False)
    observer.start()
    print("Watching for changes in db.json...")

    try:
        while True:
            time.sleep(1)  # Sleep to prevent busy waiting
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

if __name__ == "__main__":
    # Start watching
    start_watching()