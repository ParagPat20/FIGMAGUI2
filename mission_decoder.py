import json
import time
from datetime import datetime
import os

class MissionDecoder:
    def __init__(self):
        self.mission_data = None
        self.current_frame = 0
        self.commands_queue = []
        
    def load_mission(self, mission_file):
        """Load and parse mission file"""
        try:
            with open(mission_file, 'r') as f:
                self.mission_data = json.load(f)
            self.organize_commands_by_keyframe()
            return True
        except Exception as e:
            print(f"Error loading mission: {e}")
            return False
            
    def organize_commands_by_keyframe(self):
        """Organize all commands (position and custom) by keyframe"""
        if not self.mission_data:
            return
            
        max_frames = 0
        # Find maximum number of frames
        for drone_data in self.mission_data['drones'].values():
            max_frames = max(max_frames, len(drone_data['frames']))
            
        # Convert custom commands list to dict for easier access
        custom_commands_dict = {}
        if 'customCommands' in self.mission_data:
            for frame_idx, commands in self.mission_data['customCommands']:
                custom_commands_dict[frame_idx] = commands
        
        # Organize commands frame by frame
        self.commands_queue = []
        for frame_idx in range(max_frames):
            frame_commands = []
            
            # Add position commands for each drone
            for drone_id, drone_data in self.mission_data['drones'].items():
                if frame_idx < len(drone_data['frames']):
                    frame = drone_data['frames'][frame_idx]
                    # Create MTL (Move To Location) command
                    mtl_cmd = {
                        'target': drone_id,
                        'command': 'MTL',
                        'payload': f"{frame['position']['x']},{frame['position']['z']},{frame['heading']}"
                    }
                    frame_commands.append(mtl_cmd)
            
            # Add custom commands for this frame
            if frame_idx in custom_commands_dict:
                for cmd in custom_commands_dict[frame_idx]:
                    command = {
                        'target': cmd['droneId'],
                        'command': cmd['command'],
                        'payload': cmd['payload']
                    }
                    frame_commands.append(command)
            
            # Get frame delay
            delay = self.mission_data['drones']['MCU']['frames'][frame_idx]['delay'] if frame_idx < len(self.mission_data['drones']['MCU']['frames']) else 1000
            
            # Add frame commands and delay to queue
            self.commands_queue.append({
                'frame_index': frame_idx,
                'commands': frame_commands,
                'delay': delay
            })
    
    def get_next_frame_commands(self):
        """Get commands for next frame"""
        if self.current_frame < len(self.commands_queue):
            frame_data = self.commands_queue[self.current_frame]
            self.current_frame += 1
            return frame_data
        return None
    
    def reset(self):
        """Reset decoder to start"""
        self.current_frame = 0
    
    def format_command(self, cmd):
        """Format command into ESP-NOW protocol string"""
        return f"{{T:{cmd['target']};C:{cmd['command']};P:{cmd['payload']}}}"
    
    def get_total_frames(self):
        """Get total number of frames in mission"""
        return len(self.commands_queue) if self.commands_queue else 0
    
    def get_frame_commands(self, frame_index):
        """Get commands for specific frame"""
        if 0 <= frame_index < len(self.commands_queue):
            return self.commands_queue[frame_index]
        return None 
    
    def pause_mission(self):
        """Pause current mission execution"""
        self.is_paused = True
    
    def resume_mission(self):
        """Resume mission execution from where it was paused"""
        self.is_paused = False
    
    def stop_mission(self):
        """Stop mission and generate land commands for all drones"""
        land_commands = []
        if self.mission_data and 'drones' in self.mission_data:
            for drone_id in self.mission_data['drones'].keys():
                land_commands.append({
                    'target': drone_id,
                    'command': 'LAND',
                    'payload': '1'
                })
        self.reset()
        return land_commands
    
    def get_available_missions(self):
        """Get list of available mission files from Missions directory"""
        missions_dir = os.path.join(os.getcwd(), 'Missions')
        missions = []
        if os.path.exists(missions_dir):
            for file in os.listdir(missions_dir):
                if file.endswith('.json'):
                    missions.append({
                        'name': file,
                        'path': os.path.join(missions_dir, file)
                    })
        return missions 