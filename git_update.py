import subprocess
import sys
import time

def run_command(command):
    """Run a command and return its output and error status"""
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        return True, result.stdout
    except subprocess.CalledProcessError as e:
        return False, e.stderr

def git_update():
    print("Starting git update process...")
    
    # First try: Simple git pull
    success, output = run_command("git pull")
    if success:
        print("Successfully pulled changes!")
        print(output)
        return True
        
    print("Error occurred during pull. Output:", output)
    print("\nAttempting hard reset and pull...")
    
    # If pull failed, try hard reset
    commands = [
        "git fetch origin",
        "git reset --hard origin/main",  # Change 'main' to your branch name if different
        "git clean -fd",  # Remove untracked files and directories
        "git pull"
    ]
    
    for cmd in commands:
        print(f"\nExecuting: {cmd}")
        success, output = run_command(cmd)
        if not success:
            print(f"Error executing {cmd}")
            print("Error output:", output)
            return False
        print(output)
    
    print("\nRepository successfully updated!")
    return True

if __name__ == "__main__":
    try:
        if not git_update():
            print("\nFailed to update repository")
            sys.exit(1)
    except KeyboardInterrupt:
        print("\nUpdate process interrupted by user")
        sys.exit(1) 