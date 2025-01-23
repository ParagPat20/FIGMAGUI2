// Custom Alert Component
class CustomAlert {
    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'custom-alert-container';
        document.body.appendChild(this.container);
    }

    show(message, type) {
        const alert = document.createElement('div');
        alert.className = `custom-alert ${type}`;
        alert.textContent = message;

        this.container.appendChild(alert);

        // Remove alert after animation
        setTimeout(() => {
            alert.classList.add('fade-out');
            setTimeout(() => {
                this.container.removeChild(alert);
            }, 300);
        }, 3000);
    }

    success(message) {
        this.show(message, 'success');
    }

    error(message) {
        this.show(message, 'error');
    }

    info(message) {
        this.show(message, 'info');
    }
}

const customAlert = new CustomAlert();

// Replace all showAlert calls with customAlert
function showAlert(message, type = 'info') {
    customAlert[type] ? customAlert[type](message) : customAlert.show(message);
}

// DOM Elements
let elements = {};

// Initialize elements after DOM is loaded
function initializeElements() {
    elements = {
        // Drone Control Buttons
        
        // Top Bar Controls
        leaderPosCoords: document.querySelector('.coordinates'),
        separationInput: document.querySelector('.measurement input'),
        operatingAltInput: document.querySelector('.measurement-12 input'),
        programSelect: document.querySelector('.program-select'),
        startBtn: document.querySelector('.start'),
        pauseBtn: document.querySelector('.pause'),
        
        // Sidebar Menu Items
        menuItems: document.querySelectorAll('.menu-item'),
        
        // Drone Selection
        droneMcuBtn: document.querySelector('.button-drone-mcu'),

        // Add MCU button to the drone container
        mcuButton: document.createElement('button'),
    };
}

// Function to handle drone selection
function handleDroneSelect() {
    // Logic for handling the drone selection
    console.log("Drone selected");
}

// Button Event Handlers
function initializeEventListeners() {
    // Add null checks before adding event listeners
    
    // Top Bar Controls
    elements.separationInput?.addEventListener('change', handleSeparationChange);
    elements.operatingAltInput?.addEventListener('change', handleAltitudeChange);
    elements.programSelect?.addEventListener('change', handleProgramChange);
    elements.startBtn?.addEventListener('click', handleStart);
    elements.pauseBtn?.addEventListener('click', handlePause);
    elements.droneMcuBtn?.addEventListener('click', handleDroneSelect);

    // Sidebar Menu
    elements.menuItems?.forEach(item => {
        item?.addEventListener('click', handleMenuClick);
    });
    
    // Drone Selection
    elements.droneMcuBtn?.addEventListener('click', handleDroneSelect);
    
    // MCU button
    elements.mcuButton?.addEventListener('click', handleDroneSelect);

    // Add event listeners for multi-drone control buttons
    const armAllBtn = document.querySelector('.button-arm-all');
    const launchAllBtn = document.querySelector('.button-launch-all');
    const landAllBtn = document.querySelector('.button-land-all');

    armAllBtn?.addEventListener('click', () => {
        droneManager.drones.forEach((drone, droneId) => {
            send_command(droneId, 'ARM', 'GUIDED');
            console.log(`ARM command sent for ${droneId}`);
        });
    });

    launchAllBtn?.addEventListener('click', () => {
        droneManager.drones.forEach((drone, droneId) => {
            const defaultAltitude = '5'; // Default altitude value
            send_command(droneId, 'LAUNCH', defaultAltitude);
            console.log(`LAUNCH command sent for ${droneId} with altitude ${defaultAltitude}`);
        });
    });

    landAllBtn?.addEventListener('click', () => {
        droneManager.drones.forEach((drone, droneId) => {
            send_command(droneId, 'LAND', '1');
            console.log(`LAND command sent for ${droneId}`);
        });
    });
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    initializeEventListeners();
    initializeMap();
    initializeTerminalDrag();
    
    // Start fetching serial data
    setInterval(fetchSerialData, 500);
});

// Utility Functions
async function handleError(error, context = '') {
    console.error(`Error ${context}:`, error);
    customAlert.error(`Error ${context}: ${error.message}`);
}

async function validateDroneState() {
    if (!currentDrone.isArmed) {
        throw new Error('Drone must be armed first');
    }
}

// Serial Connection Management
class SerialConnection {
    constructor() {
        this.port = null;
        this.isConnected = false;
        this.portSelect = document.querySelector('.port-select');
        this.currentPort = null;
        this.portDisplay = document.querySelector('.port');
        this.heartbeatInterval = null;
        this.serialInput = document.querySelector('.serial-input');
        this.serialSend = document.querySelector('.serial-send');
        console.log('SerialConnection initialized');
        this.initializeListeners();
    }

    async initializeListeners() {
        try {
            console.log('Setting up port listeners...');
            this.portSelect?.addEventListener('click', () => {
                console.log('Port select clicked - fetching ports...');
                this.listPorts();
            });
            this.portSelect?.addEventListener('change', (e) => {
                console.log(`Port selection changed to: ${e.target.value}`);
                this.connect(e.target.value);
            });
        } catch (error) {
            console.error('Error in initializeListeners:', error);
            handleError(error, 'initializing serial listeners');
        }
    }

    async listPorts() {
        try {
            console.log('Fetching available ports...');
            const response = await fetch('http://127.0.0.1:5000/list_ports');
            if (!response.ok) throw new Error('Failed to fetch ports');
            
            const ports = await response.json();
            console.log('Available ports:', ports);
            this.updatePortList(ports);
        } catch (error) {
            console.error('Error in listPorts:', error);
            handleError(error, 'listing ports');
        }
    }

    updatePortList(ports) {
        if (!this.portSelect) {
            console.warn('Port select element not found');
            return;
        }
        
        this.portSelect.innerHTML = '<option value="" disabled selected>Select Port</option>';
        ports.forEach(port => {
            const option = document.createElement('option');
            option.value = port.port;
            option.textContent = `${port.port} - ${port.description}`;
            if (port.is_esp32) {
                option.setAttribute('data-is-esp32', 'true');
            }
            this.portSelect.appendChild(option);
        });

        if (this.currentPort) {
            this.portSelect.value = this.currentPort;
        }
    }

    async connect(portName) {
        try {
            if (!portName) {
                console.warn('No port selected');
                throw new Error('No port selected');
            }
            
            console.log(`Attempting to connect to port: ${portName}`);
            const command = "{T:GCS;C:SERIAL;P:HB}"; // Adjusted command format
            const response = await fetch('http://127.0.0.1:5000/verify_port', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ port: portName, command: command }) // Send port and command
            });
    
            if (!response.ok) throw new Error('Connection failed');
            
            const result = await response.json();
            console.log('Verification response:', result);
            
            if (result.verified) {
                // Port verified successfully
                this.isConnected = true;
                this.currentPort = portName;
                
                // Change ESP NOW text color to green
                const espNowContainer = document.querySelector('.esp-now');
                if (espNowContainer) {
                    const nowText = espNowContainer.querySelector('.now');
                    if (nowText) {
                        nowText.style.color = '#70c172';
                    }
                    const espText = espNowContainer.querySelector('.esp');
                    if (espText) {
                        espText.style.color = '#70c172';
                    }
                }
                
                if (result.cached) {
                    console.log('Using cached verification');
                } else {
                    customAlert.success('ESP32 connection verified');
                }
            } else {
                throw new Error('Not a valid ESP32 GCS device');
            }
            
        } catch (error) {
            console.error('Connection error:', error);
            const espNowContainer = document.querySelector('.esp-now');
            if (espNowContainer) {
                const nowText = espNowContainer.querySelector('.now');
                if (nowText) {
                    nowText.style.color = '#ffffff';
                }
                const espText = espNowContainer.querySelector('.esp');
                if (espText) {
                    espText.style.color = '#ffffff';
                }
            }
            this.isConnected = false;
            handleError(error, 'connecting to port');
        }
    }

}

// Initialize serial connection
const serialConnection = new SerialConnection();

function handleAddDrone() {
    createDroneList({
        // Add drone data here
        id: Date.now(),
        name: 'MCU',
        // Add other drone properties
    });
}

// Top Bar Control Functions
function handleSeparationChange(e) {
    const value = parseFloat(e.target.value);
    if (value < 0 || value > 99) {
        e.target.value = value < 0 ? 0 : 99;
    }
    updateFormation();
}

function handleAltitudeChange(e) {
    const value = parseFloat(e.target.value);
    if (value < 0 || value > 99) {
        e.target.value = value < 0 ? 0 : 99;
    }
    updateFormation();
}

function handleProgramChange(e) {
    const program = e.target.value;
    updateFormation();
}

// Add mission decoder instance
let missionDecoder = null;
let isExecutingMission = false;
let isPausedMission = false;

// Add a cache for missions at the top level
let cachedMissions = null;

// Update the loadAvailableMissions function to use caching
async function loadAvailableMissions() {
    try {
        // Return cached missions if available
        if (cachedMissions) {
            updateProgramSelect(cachedMissions);
            return;
        }

        const response = await fetch('http://127.0.0.1:5000/list_missions');
        if (!response.ok) {
            throw new Error(`Failed to fetch missions: ${response.statusText}`);
        }
        const missions = await response.json();
        
        // Cache the missions
        cachedMissions = missions;
        
        // Update program select dropdown
        updateProgramSelect(missions);
    } catch (error) {
        console.error('Error loading missions:', error);
        customAlert.error('Failed to load missions: ' + error.message);
    }
}

// Separate function to update the program select dropdown
function updateProgramSelect(missions) {
    const programSelect = document.querySelector('.program-select');
    if (!programSelect) return;

    programSelect.innerHTML = '<option value="">Select Mission</option>';
    
    missions.forEach(mission => {
        const option = document.createElement('option');
        option.value = mission.path;  // Store just the path
        option.textContent = mission.name;
        programSelect.appendChild(option);
    });
}

// Add a function to clear the cache if needed
function clearMissionCache() {
    cachedMissions = null;
}

// Function to execute mission commands
async function executeMissionCommands(commands) {
    if (!commands || commands.length === 0) return;
    
    for (const cmd of commands) {
        try {
            const formattedCmd = `{T:${cmd.target};C:${cmd.command};P:${cmd.payload}}`;
            console.log('Executing command:', formattedCmd);
            
            const response = await fetch('http://127.0.0.1:5000/send_command', {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain'
                },
                body: formattedCmd
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to send command: ${errorText}`);
            }
            
            const responseText = await response.text();
            if (responseText.includes('TargetInvalid')) {
                throw new Error(`Invalid target: ${cmd.target}`);
            }
            
            // Small delay between commands in the same frame
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.error('Error executing command:', error);
            customAlert.error('Command execution failed: ' + error.message);
            throw error;
        }
    }
}

// Add mission viewer class
class MissionViewer {
    constructor() {
        // Create styles
        const style = document.createElement('style');
        style.textContent = `
            .mission-viewer {
                position: fixed;
                top: 50%;
                right: 20px;
                transform: translateY(-50%);
                background: var(--darker-blue, #1a1a2e);
                border: 1px solid #95bdf8;
                border-radius: 8px;
                padding: 20px;
                width: 300px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                z-index: 1000;
                color: white;
                font-family: 'IBM Plex Mono', monospace;
            }
            
            .mission-viewer-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                border-bottom: 1px solid #95bdf8;
                padding-bottom: 10px;
            }
            
            .mission-viewer-header h3 {
                margin: 0;
                color: #95bdf8;
                font-size: 16px;
            }
            
            .close-viewer {
                background: none;
                border: none;
                color: #95bdf8;
                font-size: 20px;
                cursor: pointer;
                padding: 0;
                line-height: 1;
            }
            
            .progress-bar {
                background: #1a2634;
                height: 6px;
                border-radius: 3px;
                margin: 15px 0;
                overflow: hidden;
            }
            
            .progress {
                background: #4a90e2;
                height: 100%;
                border-radius: 3px;
                transition: width 0.3s ease;
                width: 0%;
            }

            .delay-progress-bar {
                background: #1a2634;
                height: 4px;
                border-radius: 2px;
                margin: 10px 0;
                overflow: hidden;
            }
            
            .delay-progress {
                background: #70c172;
                height: 100%;
                border-radius: 2px;
                transition: width linear;
                width: 0%;
            }
            
            .status-text {
                color: #95bdf8;
                font-size: 14px;
                margin-bottom: 15px;
                text-align: center;
            }
            
            .current-commands {
                max-height: 200px;
                overflow-y: auto;
                padding-right: 10px;
            }
            
            .command-item {
                display: grid;
                grid-template-columns: auto 1fr auto;
                gap: 10px;
                padding: 8px;
                background: #1a2634;
                border-radius: 4px;
                margin-bottom: 5px;
                font-size: 12px;
                align-items: center;
            }
            
            .command-item .target {
                color: #4a90e2;
                font-weight: 500;
            }
            
            .command-item .command {
                color: #95bdf8;
            }
            
            .command-item .payload {
                color: #6c757d;
                font-family: monospace;
            }
        `;
        document.head.appendChild(style);
        
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'mission-viewer';
        this.container.innerHTML = `
            <div class="mission-viewer-header">
                <h3>Mission Progress</h3>
                <button class="close-viewer">&times;</button>
            </div>
            <div class="mission-status">
                <div class="status-text">Frame: <span class="current-frame">0</span> / <span class="total-frames">0</span></div>
                <div class="progress-bar">
                    <div class="progress"></div>
                </div>
                <div class="delay-status">
                    <div class="delay-text">Frame Delay: <span class="current-delay">0</span>ms</div>
                    <div class="delay-progress-bar">
                        <div class="delay-progress"></div>
                    </div>
                </div>
                <div class="current-commands"></div>
            </div>
        `;
        
        document.body.appendChild(this.container);
        
        // Add close button handler
        this.container.querySelector('.close-viewer').addEventListener('click', () => {
            this.hide();
        });
        
        this.hide(); // Initially hidden
        this.missionData = null;
    }
    
    setMissionData(missionData) {
        this.missionData = missionData;
    }
    
    show() {
        this.container.style.display = 'block';
        this.updateProgress(0, 0);
        this.showCommands([]);
    }
    
    hide() {
        this.container.style.display = 'none';
    }
    
    updateProgress(current, total) {
        const progress = total > 0 ? (current / total) * 100 : 0;
        this.container.querySelector('.progress').style.width = `${progress}%`;
        this.container.querySelector('.current-frame').textContent = current;
        this.container.querySelector('.total-frames').textContent = total;

        // Update delay information and reset loading bar
        if (this.missionData && this.missionData.frameDelays) {
            const currentDelay = this.missionData.frameDelays[current - 1] || 1000;
            this.container.querySelector('.current-delay').textContent = currentDelay;
            
            // Remove the old delay progress bar
            const oldDelayProgress = this.container.querySelector('.delay-progress');
            const delayProgressBar = this.container.querySelector('.delay-progress-bar');
            oldDelayProgress.remove();
            
            // Create and add new delay progress bar
            const newDelayProgress = document.createElement('div');
            newDelayProgress.className = 'delay-progress';
            delayProgressBar.appendChild(newDelayProgress);
            
            // Force reflow and start new animation
            newDelayProgress.offsetHeight;
            newDelayProgress.style.transition = `width ${currentDelay}ms linear`;
            newDelayProgress.style.width = '100%';
        }
    }
    
    showCommands(commands) {
        const commandsDiv = this.container.querySelector('.current-commands');
        if (!commandsDiv) return;

        if (!commands || commands.length === 0) {
            commandsDiv.innerHTML = '<div class="command-item">No commands in this frame</div>';
            return;
        }
        
        commandsDiv.innerHTML = commands.map(cmd => {
            let payloadDisplay = cmd.payload;
            
            // Special handling for different command types
            if (cmd.command === 'LIGHT') {
                if (cmd.payload === 'rnbw') {
                    payloadDisplay = '<span style="color: rainbow">Rainbow Effect</span>';
                } else if (cmd.payload === 'chase') {
                    payloadDisplay = '<span style="color: #4a90e2">Chase Effect</span>';
                } else {
                    payloadDisplay = `<span class="color-preview" style="background-color: #${cmd.payload}"></span>`;
                }
            } else if (cmd.command === 'POS') {
                // Parse POS command payload (x,y,z,heading)
                const [x, y, z, heading] = cmd.payload.split(',').map(Number);
                payloadDisplay = `
                    <span class="pos-coord">X: ${x.toFixed(2)}</span>
                    <span class="pos-coord">Y: ${y.toFixed(2)}</span>
                    <span class="pos-coord">Z: ${z.toFixed(2)}</span>
                    <span class="pos-heading">H: ${(heading * 180 / Math.PI).toFixed(1)}°</span>
                `;
            }
            
            return `<div class="command-item">
                <span class="target">${cmd.target}</span>
                <span class="command">${cmd.command}</span>
                <span class="payload">${payloadDisplay}</span>
            </div>`;
        }).join('');
    }
}

// Create mission viewer instance
const missionViewer = new MissionViewer();

// Update handleStart function to properly show mission progress
async function handleStart() {
    const programSelect = document.querySelector('.program-select');
    const startButton = document.querySelector('.start');
    const pauseButton = document.querySelector('.pause');
    
    if (!programSelect.value) {
        customAlert.error('Please select a mission');
        return;
    }
    
    if (!isExecutingMission) {
        try {
            startButton.disabled = true;
            
            // Initialize mission decoder if not already initialized
            if (!missionDecoder) {
                const response = await fetch(`http://127.0.0.1:5000${programSelect.value}`);
                if (!response.ok) {
                    throw new Error(`Failed to load mission: ${response.statusText}`);
                }
                const missionData = await response.json();
                missionDecoder = new MissionDecoder();
                await missionDecoder.load_mission(missionData);
                
                // Show mission viewer and set mission data
                missionViewer.setMissionData(missionData);
                missionViewer.show();
            }
            
            isExecutingMission = true;
            isPausedMission = false;
            
            // Update button states
            startButton.textContent = 'Stop';
            startButton.classList.add('stop');
            startButton.disabled = false;
            pauseButton.style.display = 'inline-block';
            pauseButton.textContent = 'Pause';
            
            customAlert.success('Mission started');
            
            // Start mission execution loop
            let frameIndex = 0;
            const totalFrames = missionDecoder.frames.length;
            
            while (isExecutingMission && !isPausedMission && frameIndex < totalFrames) {
                const frameData = missionDecoder.get_next_frame_commands();
                if (!frameData) {
                    break;
                }
                
                // Update mission viewer with current frame data
                frameIndex++;
                missionViewer.updateProgress(frameIndex, totalFrames);
                missionViewer.showCommands(frameData.commands);
                
                // Execute all commands for this frame
                await executeMissionCommands(frameData.commands);
                
                // Wait for frame delay
                await new Promise(resolve => setTimeout(resolve, frameData.delay));
            }

            // Mission complete or stopped
            if (frameIndex >= totalFrames) {
                customAlert.success('Mission completed successfully');
                handleStop();
            }

        } catch (error) {
            console.error('Error executing mission:', error);
            customAlert.error('Failed to execute mission: ' + error.message);
            handleStop();
        }
    } else {
        // Stop mission
        handleStop();
    }
}

// Update handleStop to properly clean up the mission viewer
async function handleStop() {
    if (missionDecoder) {
        const landCommands = missionDecoder.stop_mission();
        await executeMissionCommands(landCommands);
    }
    
    isExecutingMission = false;
    isPausedMission = false;
    missionDecoder = null;
    
    const startButton = document.querySelector('.start');
    const pauseButton = document.querySelector('.pause');
    
    // Update button states
    startButton.textContent = 'Start';
    startButton.classList.remove('stop');
    startButton.disabled = false;
    pauseButton.style.display = 'none';
    pauseButton.textContent = 'Pause';
    
    // Hide mission viewer
    missionViewer.hide();
}

// Update handlePause function
function handlePause() {
    const pauseButton = document.querySelector('.pause');
    
    if (isExecutingMission) {
        if (!isPausedMission) {
            // Pause mission
            isPausedMission = true;
            missionDecoder?.pause_mission();
            pauseButton.textContent = 'Resume';
            customAlert.success('Mission paused');
        } else {
            // Resume mission
            isPausedMission = false;
            missionDecoder?.resume_mission();
            pauseButton.textContent = 'Pause';
            customAlert.success('Mission resumed');
        }
    }
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initial load of missions
    loadAvailableMissions();
    
    // Add event listeners for mission control buttons
    document.querySelector('.start')?.addEventListener('click', handleStart);
    document.querySelector('.pause')?.addEventListener('click', handlePause);

    // Add refresh button if needed
    const refreshBtn = document.querySelector('.refresh-missions');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            clearMissionCache();
            loadAvailableMissions();
        });
    }
});

// Sidebar Menu Functions
function handleMenuClick(e) {
    const menuItem = e.currentTarget;
    elements.menuItems.forEach(item => item.classList.remove('active'));
    menuItem.classList.add('active');
    
    const menuId = menuItem.id;
    switch(menuId) {
        case 'menu-home':
            showHomeView();
            break;
        case 'menu-drone-settings':
            showDroneSettings();
            break;
        case 'menu-missions':
            showMissions();
            break;
        case 'menu-logbook':
            showLogbook();
            break;
        case 'menu-settings':
            showSettings();
            break;
        case 'menu-help':
            showHelp();
            break;
        case 'menu-mtl':
            showMTL();
            break;
    }
}

// Update showMTL function to create a popup
function showMTL() {
    // Create MTL interface if it doesn't exist
    let mtlInterface = document.querySelector('.mtl-popup');
    if (!mtlInterface) {
        mtlInterface = document.createElement('div');
        mtlInterface.className = 'mtl-popup';
        mtlInterface.innerHTML = `
            <div class="mtl-content">
                <div class="mtl-header">
                    <h2>Mission Text Loader</h2>
                    <div class="mtl-controls">
                        <button class="load-txt-btn">Load File</button>
                        <button class="save-txt-btn">Save File</button>
                        <button class="new-txt-btn">New File</button>
                        <button class="close-mtl">&times;</button>
                    </div>
                </div>
                <div class="mtl-editor">
                    <div class="file-list">
                        <h3>Files</h3>
                        <div class="txt-files"></div>
                    </div>
                    <div class="editor-area">
                        <textarea class="txt-editor" placeholder="Enter commands here..."></textarea>
                        <div class="editor-controls">
                            <button class="execute-btn">Execute</button>
                            <div class="execution-controls">
                                <label>Delay (ms):</label>
                                <input type="number" class="delay-input" value="500" min="100" max="5000" step="100">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(mtlInterface);
        
        // Add close button handler
        const closeBtn = mtlInterface.querySelector('.close-mtl');
        closeBtn.addEventListener('click', () => {
            mtlInterface.style.display = 'none';
        });
        
        // Make popup draggable
        const header = mtlInterface.querySelector('.mtl-header');
        makeDraggable(mtlInterface, header);
        
        initializeMTLHandlers(mtlInterface);
    }
    
    mtlInterface.style.display = 'block';
}

// Add draggable functionality
function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    handle.style.cursor = 'move';
    handle.onmousedown = dragMouseDown;
    
    function dragMouseDown(e) {
        e.preventDefault();
        // Get mouse position at startup
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        
        // Add dragging class
        element.classList.add('dragging');
    }
    
    function elementDrag(e) {
        e.preventDefault();
        // Calculate new position
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // Set element's new position
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }
    
    function closeDragElement() {
        // Stop moving when mouse button is released
        document.onmouseup = null;
        document.onmousemove = null;
        element.classList.remove('dragging');
    }
}

// Update MTL popup HTML structure and styling
const mtlPopupStyle = document.createElement('style');
mtlPopupStyle.textContent = `
    .mtl-popup {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 900px;
        height: 600px;
        background: linear-gradient(135deg, var(--darker-blue) 0%, var(--dark-blue) 100%);
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        z-index: 1000;
        display: none;
        border: 1px solid rgba(112, 193, 114, 0.3);
        overflow: hidden;
    }
    
    .mtl-popup.dragging {
        user-select: none;
        opacity: 0.95;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
        transition: box-shadow 0.3s ease;
    }
    
    .mtl-header {
        padding: 20px;
        background: rgba(0, 0, 0, 0.2);
        border-bottom: 1px solid rgba(112, 193, 114, 0.2);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    
    .mtl-header h2 {
        color: #70c172;
        font-family: IBM Plex Mono, monospace;
        font-size: 22px;
        margin: 0;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }
    
    .mtl-controls {
        display: flex;
        gap: 12px;
        align-items: center;
    }
    
    .mtl-controls button {
        padding: 8px 16px;
        border-radius: 6px;
        font-family: IBM Plex Mono, monospace;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    
    .mtl-controls button:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    }
    
    .load-txt-btn::before { content: "📂"; }
    .save-txt-btn::before { content: "💾"; }
    .new-txt-btn::before { content: "📄"; }
    
    .load-txt-btn, .save-txt-btn, .new-txt-btn {
        background: rgba(28, 43, 64, 0.8);
        border: 1px solid rgba(112, 193, 114, 0.3);
        color: #ffffff;
    }
    
    .close-mtl {
        background: rgba(240, 81, 81, 0.1);
        border: none;
        color: #f05151;
        font-size: 24px;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        margin-left: 12px;
    }
    
    .close-mtl:hover {
        background: rgba(240, 81, 81, 0.2);
        transform: rotate(90deg);
    }
    
    .mtl-editor {
        display: flex;
        gap: 20px;
        padding: 20px;
        height: 485px;
    }
    
    .file-list {
        width: 220px;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 12px;
        padding: 16px;
    }
    
    .file-list h3 {
        color: #70c172;
        margin: 0 0 16px 0;
        font-family: IBM Plex Mono, monospace;
        font-size: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .file-list h3::before {
        content: "📁";
    }
    
    .editor-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }
    
    .txt-editor {
        flex: 1;
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(112, 193, 114, 0.2);
        border-radius: 12px;
        padding: 16px;
        color: #ffffff;
        font-family: IBM Plex Mono, monospace;
        font-size: 14px;
        line-height: 1.5;
        resize: none;
    }
    
    .txt-editor:focus {
        outline: none;
        border-color: #70c172;
        box-shadow: 0 0 0 2px rgba(112, 193, 114, 0.1);
    }
    
    .editor-controls {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(0, 0, 0, 0.2);
        padding: 12px;
        border-radius: 12px;
    }
    
    .execute-btn {
        padding: 10px 24px;
        background: linear-gradient(135deg, #70c172 0%, #4e8d50 100%);
        border: none;
        border-radius: 6px;
        color: #ffffff;
        font-family: IBM Plex Mono, monospace;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .execute-btn::before {
        content: "▶️";
    }
    
    .execute-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(112, 193, 114, 0.3);
    }
    
    .execute-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
    }
    
    .execution-controls {
        display: flex;
        align-items: center;
        gap: 12px;
        background: rgba(28, 43, 64, 0.6);
        padding: 8px 16px;
        border-radius: 6px;
    }
    
    .execution-controls label {
        color: #95bdf8;
        font-family: IBM Plex Mono, monospace;
        font-size: 14px;
    }
    
    .delay-input {
        width: 90px;
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(112, 193, 114, 0.3);
        border-radius: 4px;
        padding: 6px 10px;
        color: #70c172;
        font-family: IBM Plex Mono, monospace;
        text-align: center;
    }
    
    .delay-input:focus {
        outline: none;
        border-color: #70c172;
    }
    
    /* Add highlight for current command during execution */
    .txt-editor.executing {
        background: rgba(112, 193, 114, 0.05);
    }
    
    .txt-editor::selection {
        background: rgba(112, 193, 114, 0.3);
        color: #ffffff;
    }
    
    .terminal-line.executing {
        color: #ffab49;
        background: rgba(255, 171, 73, 0.1);
        border-left: 2px solid #ffab49;
        padding-left: 8px;
        animation: pulse 1s infinite;
    }
    
    .terminal-line.executed {
        color: #70c172;
        border-left: 2px solid #70c172;
        padding-left: 8px;
    }
    
    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.7; }
        100% { opacity: 1; }
    }
    
    .esp-terminal-content {
        max-height: calc(100% - 40px);
        overflow-y: auto;
        padding: 10px;
    }
    
    .esp-terminal-content::-webkit-scrollbar {
        width: 6px;
    }
    
    .esp-terminal-content::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.1);
    }
    
    .esp-terminal-content::-webkit-scrollbar-thumb {
        background: rgba(255, 171, 73, 0.3);
        border-radius: 3px;
    }
`;

document.head.appendChild(mtlPopupStyle);

function initializeMTLHandlers(mtlInterface) {
    const loadBtn = mtlInterface.querySelector('.load-txt-btn');
    const saveBtn = mtlInterface.querySelector('.save-txt-btn');
    const newBtn = mtlInterface.querySelector('.new-txt-btn');
    const executeBtn = mtlInterface.querySelector('.execute-btn');
    const editor = mtlInterface.querySelector('.txt-editor');
    const delayInput = mtlInterface.querySelector('.delay-input');
    
    // Create hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.txt';
    fileInput.style.display = 'none';
    mtlInterface.appendChild(fileInput);
    
    // Load file handler
    loadBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            editor.value = event.target.result;
            customAlert.success('File loaded successfully');
        };
        reader.onerror = () => {
            customAlert.error('Error reading file');
        };
        reader.readAsText(file);
    });
    
    // Save file handler
    saveBtn.addEventListener('click', () => {
        const content = editor.value;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mission.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        customAlert.success('File saved successfully');
    });
    
    // New file handler
    newBtn.addEventListener('click', () => {
        if (editor.value && !confirm('Discard current changes?')) {
            return;
        }
        editor.value = '';
        customAlert.info('New file created');
    });
    
    // Execute handler
    executeBtn.addEventListener('click', async () => {
        const commands = editor.value.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
            
        if (commands.length === 0) {
            customAlert.error('No valid commands found');
            return;
        }
        
        const delay = parseInt(delayInput.value) || 500;
        executeBtn.disabled = true;
        editor.classList.add('executing');
        
        try {
            const espTerminal = document.querySelector('.esp-terminal-content');
            
            for (let i = 0; i < commands.length; i++) {
                const command = commands[i];
                
                // Update editor to highlight current command
                const lines = editor.value.split('\n');
                const startPos = lines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
                const endPos = startPos + command.length;
                
                editor.setSelectionRange(startPos, endPos);
                editor.focus();
                
                // Add command to ESP terminal
                if (espTerminal) {
                    const terminalLine = document.createElement('div');
                    terminalLine.className = 'terminal-line executing';
                    terminalLine.textContent = `> ${command}`;
                    espTerminal.appendChild(terminalLine);
                    espTerminal.scrollTop = espTerminal.scrollHeight;
                    
                    // Add execution status after delay
                    await new Promise(resolve => setTimeout(resolve, delay));
                    terminalLine.classList.remove('executing');
                    terminalLine.classList.add('executed');
                }
                
                // Send command through serial connection
                const serialInput = document.querySelector('.serial-input');
                const serialSend = document.querySelector('.serial-send');
                
                if (serialInput && serialSend) {
                    serialInput.value = command;
                    serialSend.click();
                }
                
                // Show progress
                customAlert.info(`Executing command ${i + 1} of ${commands.length}`);
            }
            
            customAlert.success('Execution completed');
        } catch (error) {
            customAlert.error('Error during execution: ' + error.message);
        } finally {
            executeBtn.disabled = false;
            editor.classList.remove('executing');
            editor.setSelectionRange(0, 0);
        }
    });
}

function updateFormation() {
    // Implementation for updating drone formation
}

function startMission() {
    // Implementation for starting mission
}

function pauseMission() {
    // Implementation for pausing mission
}

// View Management Functions
function showHomeView() {
    // Implementation for home view
}

function showDroneSettings() {
    // Implementation for drone settings view
}

function showMissions() {
    loadAvailableMissions();
    // ... rest of showMissions implementation
}

function showLogbook() {
    // Implementation for logbook view
}

function showSettings() {
    // Implementation for settings view
}

function showHelp() {
    // Implementation for help view
}

// Map Management (if using Leaflet)
let map = null;
let droneMarkers = new Map();

function initializeMap() {
    if (!map) {
        map = L.map('map', {
            center: [0, 0],
            zoom: 2,
            zoomControl: true,
            attributionControl: false
        });

        // Light mode tiles
        const lightMode = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            minZoom: 2
        });

        // Satellite mode tiles
        const satelliteMode = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            minZoom: 2
        });

        // Add custom control for layer switching
        const layerControl = L.control({position: 'topright'});
        
        layerControl.onAdd = function () {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control map-type-control');
            
            // Add light mode button
            const lightButton = L.DomUtil.create('a', 'map-type-button light-mode active', container);
            lightButton.innerHTML = 'Map';
            lightButton.href = '#';
            
            // Add satellite mode button
            const satelliteButton = L.DomUtil.create('a', 'map-type-button satellite-mode', container);
            satelliteButton.innerHTML = 'Satellite';
            satelliteButton.href = '#';
            
            // Add click handlers
            L.DomEvent.on(lightButton, 'click', function(e) {
                L.DomEvent.preventDefault(e);
                map.removeLayer(satelliteMode);
                map.addLayer(lightMode);
                lightButton.classList.add('active');
                satelliteButton.classList.remove('active');
            });
            
            L.DomEvent.on(satelliteButton, 'click', function(e) {
                L.DomEvent.preventDefault(e);
                map.removeLayer(lightMode);
                map.addLayer(satelliteMode);
                satelliteButton.classList.add('active');
                lightButton.classList.remove('active');
            });
            
            return container;
        };

        // Add the control to map
        layerControl.addTo(map);
        
        // Set default layer
        lightMode.addTo(map);
    }
}

function updateDroneMarker(droneId, position, heading, altitude, name) {
    const droneIcon = L.divIcon({
        className: 'drone-marker',
        html: `
            <div class="drone-marker-container">
                <div class="drone-name">${name}</div>
                <div class="drone-heading-indicator" style="transform: rotate(${heading}deg)"></div>
                <div class="drone-altitude">${altitude}m</div>
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });

    if (!droneMarkers.has(droneId)) {
        const marker = L.marker(position, { icon: droneIcon }).addTo(map);
        droneMarkers.set(droneId, marker);
        map.setView(position, 18, {
            animate: true,
            duration: 1
        });
    } else {
        const marker = droneMarkers.get(droneId);
        marker.setLatLng(position);
        marker.setIcon(droneIcon);
    }
}

class DroneCard {
    constructor(droneId, name) {
        this.droneId = droneId;
        this.name = name;
        this.element = this.createCard();
        this.attitudeInterval = null;
    }

    createCard() {
        const card = document.createElement('div');
        card.className = 'drone-card';
        card.innerHTML = `
            <div class="drone-card-header">
                <span class="drone-name" style="display: block;">${this.name}</span>
                <div class="connection-status">
                    <div class="status-indicator"></div>
                    <span class="status-text">Connected</span>
                </div>
            </div>
            <div class="flight-container">
                <div class="attitude-section">
                    <div class="attitude-indicator">
                        <div class="attitude-horizon"></div>
                        <div class="attitude-lines"></div>
                        <div class="param-overlay heading">
                            <span data-param="heading">HDG 0°</span>
                        </div>
                        <div class="param-overlay battery">
                            <span data-param="battery">BAT 0%</span>
                        </div>
                        <div class="param-overlay voltage">
                            <span data-param="voltage">0.0V</span>
                        </div>
                        <div class="param-overlay current">
                            <span data-param="current">0.0A</span>
                        </div>
                        <div class="param-overlay gps">
                            <span data-param="gps">No Fix</span>
                        </div>
                        <div class="param-overlay mode">
                            <span data-param="mode">STABILIZE</span>
                        </div>
                        <div class="param-overlay speed" style="display: none;">
                            <span data-param="speed">0.0 m/s</span>
                        </div>
                        <div class="param-overlay airspeed" style="display: none;">
                            <span data-param="airSpeed">AS: 0.0</span>
                        </div>
                        <div class="param-overlay groundspeed" style="display: none;">
                            <span data-param="groundSpeed">GS: 0.0</span>
                        </div>
                        <div class="param-overlay roll" style="display: none;">
                            <span data-param="roll">R: 0.0°</span>
                        </div>
                        <div class="param-overlay pitch" style="display: none;">
                            <span data-param="pitch">P: 0.0°</span>
                        </div>
                        <div class="param-overlay yaw" style="display: none;">
                            <span data-param="yaw">Y: 0.0°</span>
                        </div>
                        <div class="altitude-display" style="display: none;">
                            <span class="altitude-value" data-param="altitude">0.0m</span>
                        </div>
                        <div class="param-overlay coordinates" style="display: none;">
                            <span data-param="latitude">LAT: 0.000000</span>
                            <span data-param="longitude">LON: 0.000000</span>
                        </div>
                    </div>
                    <div class="drone-controls">
                        <button class="drone-control-btn arm-btn" data-drone="${this.droneId}">ARM</button>
                        <button class="drone-control-btn launch-btn" data-drone="${this.droneId}">LAUNCH</button>
                        <button class="drone-control-btn mode-btn" data-drone="${this.droneId}">MODE</button>
                        <button class="drone-control-btn land-btn" data-drone="${this.droneId}">LAND</button>
                        <button class="drone-control-btn attitude-btn" data-drone="${this.droneId}">ATTITUDE</button>
                    </div>
                </div>
            </div>
        `;

        this.setupEventListeners(card);
        return card;
    }

    setupEventListeners(card) {
        const armBtn = card.querySelector('.arm-btn');
        const launchBtn = card.querySelector('.launch-btn');
        const modeBtn = card.querySelector('.mode-btn');
        const landBtn = card.querySelector('.land-btn');
        const attitudeBtn = card.querySelector('.attitude-btn');

        armBtn.addEventListener('click', () => this.handleArm(this.droneId));
        launchBtn.addEventListener('click', () => this.handleLaunch(this.droneId));
        landBtn.addEventListener('click', () => this.handleLand(this.droneId));
        attitudeBtn.addEventListener('click', () => {
            this.startSendingAttitudeRequests(this.droneId);
        });

        // Create and setup mode dropdown
        const modeDropdown = document.createElement('div');
        modeDropdown.className = 'mode-dropdown';
        const modes = ['GUIDED', 'POSHOLD', 'LOITER', 'STABILIZE', 'RTL', 'LAND', 'SMART_RTL', 'FLIP', 'ALT_HOLD'];
        modes.forEach(mode => {
            const modeOption = document.createElement('div');
            modeOption.className = 'mode-option';
            modeOption.textContent = mode;
            modeOption.addEventListener('click', () => {
                send_command(this.droneId, 'SET_MODE', mode);
                console.log(`Mode set to ${mode} for ${this.droneId}`);
                modeDropdown.style.display = 'none';
            });
            modeDropdown.appendChild(modeOption);
        });
        document.body.appendChild(modeDropdown); // Append to body

        // Toggle dropdown on mode button click
        modeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdowns = document.querySelectorAll('.mode-dropdown');
            dropdowns.forEach(dropdown => {
                if (dropdown !== modeDropdown) {
                    dropdown.style.display = 'none';
                }
            });
            const rect = modeBtn.getBoundingClientRect();
            modeDropdown.style.top = `${rect.bottom + window.scrollY}px`;
            modeDropdown.style.left = `${rect.left + window.scrollX}px`;
            modeDropdown.style.display = modeDropdown.style.display === 'block' ? 'none' : 'block';
        });

        // Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!card.contains(e.target) && !modeBtn.contains(e.target)) {
                modeDropdown.style.display = 'none';
            }
        });
    }

    toggleSendingAttitudeRequests(droneId) {
        if (!this.attitudeInterval) {
            this.attitudeInterval = setInterval(() => {
                this.handleAttitude(droneId);
            }, 800);
        } else {
            clearInterval(this.attitudeInterval);
            this.attitudeInterval = null;
        }
    }

    handleAttitude(droneId) {
        // Request location data
        send_command(droneId, 'REQ', 'LOC');
        console.log(`Requesting location data for ${droneId}`);

        // Request GPS data
        send_command(droneId, 'REQ', 'GPS');
        console.log(`Requesting GPS data for ${droneId}`);

        // Request battery data
        send_command(droneId, 'REQ', 'BATT');
        console.log(`Requesting battery data for ${droneId}`);

        // Request attitude data
        send_command(droneId, 'REQ', 'ATTITUDE');
        console.log(`Requesting attitude data for ${droneId}`);

        // Request speed data
        send_command(droneId, 'REQ', 'SPEED');
        console.log(`Requesting speed data for ${droneId}`);

        // Request MODE data
        send_command(droneId, 'REQ', 'MODE');
        console.log(`Requesting mode data for ${droneId}`);

        send_command(droneId, 'REQ', 'ARMED');
        console.log(`Requesting armed data for ${droneId}`);    
    }

    updateParams(params) {
        console.log('Updating params:', params); // Debug log
        Object.entries(params).forEach(([key, value]) => {
            const element = this.element.querySelector(`[data-param="${key}"]`);
            if (element) {
                console.log(`Updating ${key} with value:`, value); // Debug log
                // Update the text content based on the parameter type
                switch(key) {
                    case 'heading':
                        element.textContent = `HDG ${Math.round(value)}°`;
                        break;
                    case 'battery':
                        element.textContent = `BAT ${value}%`;
                        if (parseInt(value) < 20) {
                            element.className = 'param-value error';
                        } else if (parseInt(value) < 50) {
                            element.className = 'param-value warning';
                        }
                        break;
                    case 'voltage':
                        element.textContent = `${parseFloat(value).toFixed(1)}V`;
                        break;
                    case 'current':
                        element.textContent = `${parseFloat(value).toFixed(2)}A`;
                        break;
                    case 'mode':
                        element.textContent = value;
                        break;
                    case 'gps':
                        element.textContent = value;
                        break;
                    case 'altitude':
                        element.textContent = `${parseFloat(value).toFixed(1)}m`;
                        break;
                    case 'speed':
                        element.textContent = `${parseFloat(value).toFixed(1)} m/s`;
                        break;
                    case 'airSpeed':
                        element.textContent = `AS: ${parseFloat(value).toFixed(1)}`;
                        break;
                    case 'groundSpeed':
                        element.textContent = `GS: ${parseFloat(value).toFixed(1)}`;
                        break;
                    case 'roll':
                        element.textContent = `R: ${value}°`;
                        break;
                    case 'pitch':
                        element.textContent = `P: ${value}°`;
                        break;
                    case 'yaw':
                        element.textContent = `Y: ${value}°`;
                        break;
                    case 'armed':
                        element.textContent = value;
                        break;
                    default:
                        element.textContent = value;
                }
            } else {
                console.warn(`Element with data-param="${key}" not found`); // Debug log
            }
        });

        // Update attitude indicator
        if (params.roll !== undefined || params.pitch !== undefined) {
            const horizon = this.element.querySelector('.attitude-horizon');
            if (horizon) {
                const roll = params.roll || 0;
                const pitch = params.pitch || 0;
                console.log('Updating attitude:', { roll, pitch }); // Debug log
                // Update horizon position
                horizon.style.transform = `rotate(${roll}deg) translateY(${pitch}%)`;
            }
        }
    }

    handleArm(droneId) {
        send_command(droneId, 'ARM', 'GUIDED');
        console.log(`ARM command sent for ${droneId}`);
    }

    handleLaunch(droneId) {
        const altitudeInput = this.element.querySelector('.altitude-input');
        const altitude = altitudeInput ? altitudeInput.value : '5'; // Default to 2 if no value is entered
        send_command(droneId, 'LAUNCH', altitude);
        console.log(`LAUNCH command sent for ${droneId} with altitude ${altitude}`);
    }

    handleLand(droneId) {
        send_command(droneId, 'LAND', '1');
        console.log(`LAND command sent for ${droneId}`);
    }

    handleMode(droneId) {
        const modeBtn = this.element.querySelector('.mode-btn');
        const modes = ['GUIDED', 'POSHOLD', 'LOITER', 'STABILIZE', 'RTL', 'LAND', 'SMART_RTL', 'FLIP', 'ALT_HOLD'];
        let currentModeIndex = 0;

        // Set initial mode text
        modeBtn.textContent = modes[currentModeIndex];

        // Create a new button with fresh event listeners
        const updatedModeBtn = modeBtn.cloneNode(true);
        modeBtn.parentNode.replaceChild(updatedModeBtn, modeBtn);

        // Handle mouse wheel event - only change the displayed mode
        updatedModeBtn.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY < 0) {
                // Scroll up - go to previous mode
                currentModeIndex = (currentModeIndex - 1 + modes.length) % modes.length;
            } else {
                // Scroll down - go to next mode
                currentModeIndex = (currentModeIndex + 1) % modes.length;
            }
            updatedModeBtn.textContent = modes[currentModeIndex];
        }, { passive: false });

        // Handle click event - send the command for the currently displayed mode
        updatedModeBtn.addEventListener('click', () => {
            const selectedMode = modes[currentModeIndex];
            send_command(droneId, 'SET_MODE', selectedMode);
            console.log(`Mode set to ${selectedMode} for ${droneId}`);
        });
    }

    startSendingAttitudeRequests(droneId) {
        // Logic to start sending attitude requests
        this.toggleSendingAttitudeRequests(droneId);
    }
}

// Drone management
const droneManager = {
    drones: new Map(),
    
    addDrone(droneId, name) {
        if (!this.drones.has(droneId)) {
            // Set the name to "CD5" if the droneId is for CD5
            const droneName = droneId === "CD5" ? "CD5" : name; // Change this line
            const droneCard = new DroneCard(droneId, droneName);
            const container = document.querySelector('.drone-cards-container');
            container.appendChild(droneCard.element); // Changed from prepend to appendChild
            this.drones.set(droneId, droneCard);
            this.updateGridLayout();
        }
    },
    
    removeDrone(droneId) {
        const drone = this.drones.get(droneId);
        if (drone) {
            drone.element.remove();
            this.drones.delete(droneId);
        }
    },
    
    updateDroneParams(droneId, params) {
        const drone = this.drones.get(droneId);
        if (drone) {
            drone.updateParams(params);
        }
    },

    updateGridLayout() {
        const container = document.querySelector('.drone-cards-container');
        if (container) {
            const cardCount = this.drones.size;
            // Adjust columns based on number of cards
            const columns = cardCount <= 3 ? cardCount : Math.ceil(cardCount / 2);
            container.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
        }
    }
};

class MissionPlanner {
    constructor() {
        // Initialize basic properties
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        // Grid settings
        this.gridSize = 100; // 100x100 meter grid
        this.gridSpacing = 1; // 1 meter between grid lines
        this.pixelsPerMeter = 10; // Scale for 2D view
        
        // Drone settings
        this.defaultDrones = ['MCU', 'CD1', 'CD2', 'CD3', 'CD4', 'CD5'];
        this.droneModels = new Map(); // For 3D models
        this.droneMarkers = new Map(); // For 2D markers
        
        // Keyframe system
        this.maxKeyframes = 100; // Maximum number of keyframes
        this.keyframes = new Map(); // Map of drone ID to array of keyframes
        this.currentKeyframe = 0;
        this.isPlaying = false;

        // Custom commands
        this.customCommands = new Map(); // Map of keyframe index to array of commands
        this.selectedDroneId = null;
        this.keyboardControlEnabled = false;
        this.initializeKeyboardControls();
    }

    initialize() {
        // Initialize DOM elements
        this.popup = document.querySelector('.mission-planner-popup');
        this.canvas2D = document.getElementById('mission-canvas-2d');
        this.canvas3D = document.getElementById('mission-canvas-3d');
        this.droneList = document.querySelector('.drone-list');
        
        // Create keyframe list container if it doesn't exist
        this.keyframeList = document.querySelector('.keyframe-list');
        if (!this.keyframeList) {
            const playbackControls = document.querySelector('.playback-controls');
            if (playbackControls) {
                this.keyframeList = document.createElement('div');
                this.keyframeList.className = 'keyframe-list';
                playbackControls.appendChild(this.keyframeList);
            }
        }
        
        if (!this.popup || !this.canvas2D || !this.canvas3D || !this.droneList) {
            console.error('Required mission planner elements not found', {
                popup: !!this.popup,
                canvas2D: !!this.canvas2D,
                canvas3D: !!this.canvas3D,
                droneList: !!this.droneList
            });
            return false;
        }

        this.ctx2D = this.canvas2D.getContext('2d');
        
        // Initialize components
        this.initializeListeners();
        this.initializeDefaultDrones();
        
        // Add zoom event listener to 2D canvas
        this.canvas2D?.addEventListener('wheel', this.handleZoom.bind(this));
        
        // Initialize custom command handlers
        const commandSelect = document.getElementById('custom-command');
        const lightColorPicker = document.getElementById('light-color-picker');
        const addCommandBtn = document.getElementById('add-command');

        // Update selected drone when drone is clicked
        this.droneList?.addEventListener('click', (e) => {
            const droneItem = e.target.closest('.drone-item');
            if (droneItem) {
                this.selectedDroneId = droneItem.dataset.droneId;
                // Update UI to show selected drone
                document.querySelectorAll('.drone-item').forEach(item => {
                    item.classList.toggle('selected', item === droneItem);
                });
            }
        });

        commandSelect?.addEventListener('change', (e) => {
            if (e.target.value === 'LIGHT') {
                lightColorPicker.style.display = 'block';
            } else {
                lightColorPicker.style.display = 'none';
            }
        });

        addCommandBtn?.addEventListener('click', () => {
            if (!this.selectedDroneId) {
                customAlert.warning('Please select a drone first');
                return;
            }

            const command = commandSelect.value;
            if (!command) {
                customAlert.warning('Please select a command');
                return;
            }

            let payload = '1'; // Default payload
            if (command === 'LIGHT') {
                const color = document.getElementById('light-color').value;
                payload = color.substring(1); // Remove # from hex color
            }

            this.addCustomCommand(this.currentKeyframe, this.selectedDroneId, command, payload);
            this.updateCommandList();
            customAlert.success(`Added ${command} command for ${this.selectedDroneId}`);
        });

        // Add CSS styles for command list
        const styleSheet = document.createElement('style');
        styleSheet.textContent = `
            .custom-command-settings {
                margin-top: 20px;
                padding: 15px;
                background: #1a1a1a;
                border-radius: 8px;
            }

            .command-inputs {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .command-list {
                margin-top: 15px;
                max-height: 150px;
                overflow-y: auto;
                border: 1px solid #333;
                border-radius: 4px;
                padding: 5px;
            }

            .command-item {
                display: flex;
                align-items: center;
                padding: 8px;
                margin: 5px 0;
                background: #2a2a2a;
                border-radius: 4px;
                border-left: 3px solid #00ff00;
            }

            .command-drone {
                font-weight: bold;
                color: #00ff00;
                margin-right: 15px;
                min-width: 60px;
            }

            .command-name {
                color: #ffffff;
                margin-right: 15px;
                min-width: 80px;
            }

            .command-payload {
                flex: 1;
                display: flex;
                align-items: center;
                color: #888;
            }

            .color-preview {
                display: inline-block;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                border: 2px solid #444;
                margin-left: 10px;
            }

            .delete-command {
                background: none;
                border: none;
                color: #ff4444;
                cursor: pointer;
                font-size: 18px;
                padding: 0 8px;
                margin-left: 10px;
                opacity: 0.7;
                transition: opacity 0.2s;
            }

            .delete-command:hover {
                opacity: 1;
                color: #ff0000;
            }

            #custom-command {
                width: 100%;
                padding: 8px;
                background: #2a2a2a;
                color: white;
                border: 1px solid #444;
                border-radius: 4px;
                cursor: pointer;
            }

            #custom-command option {
                background: #2a2a2a;
                color: white;
                padding: 5px;
            }

            #light-color {
                width: 100%;
                height: 35px;
                padding: 2px;
                border: 1px solid #444;
                border-radius: 4px;
                cursor: pointer;
            }

            .add-command {
                margin-top: 10px;
                width: 100%;
                padding: 10px;
                background: #2d2d2d;
                color: white;
                border: 1px solid #444;
                border-radius: 4px;
                cursor: pointer;
                transition: background 0.2s;
            }

            .add-command:hover {
                background: #3d3d3d;
            }

            .add-command:active {
                background: #4d4d4d;
            }

            /* Scrollbar styling */
            .command-list::-webkit-scrollbar {
                width: 8px;
            }

            .command-list::-webkit-scrollbar-track {
                background: #1a1a1a;
                border-radius: 4px;
            }

            .command-list::-webkit-scrollbar-thumb {
                background: #444;
                border-radius: 4px;
            }

            .command-list::-webkit-scrollbar-thumb:hover {
                background: #555;
            }
        `;
        document.head.appendChild(styleSheet);
        
        // Add delete all commands button
        const commandInputs = document.querySelector('.command-inputs');
        if (commandInputs) {
            const deleteAllBtn = document.createElement('button');
            deleteAllBtn.className = 'delete-all-commands';
            deleteAllBtn.textContent = 'Delete All Commands';
            deleteAllBtn.addEventListener('click', () => {
                if (this.customCommands.has(this.currentKeyframe)) {
                    this.customCommands.delete(this.currentKeyframe);
                    this.updateCommandList();
                    this.updateKeyframeList();
                    customAlert.success('All commands deleted for current keyframe');
                }
            });
            commandInputs.appendChild(deleteAllBtn);
        }

        // Add CSS for delete all button
        const deleteAllStyle = document.createElement('style');
        deleteAllStyle.textContent = `
            .delete-all-commands {
                margin-top: 10px;
                width: 100%;
                padding: 8px;
                background: #3a1a1a;
                color: #ff4444;
                border: 1px solid #662222;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .delete-all-commands:hover {
                background: #4a2a2a;
                color: #ff6666;
            }
        `;
        document.head.appendChild(deleteAllStyle);
        
        return true;
    }

    initializeListeners() {
        // View toggle buttons
        const viewToggles = document.querySelectorAll('.view-toggle');
        if (viewToggles.length > 0) {
            viewToggles.forEach(toggle => {
                toggle.addEventListener('click', () => {
                    viewToggles.forEach(t => t.classList.remove('active'));
                    toggle.classList.add('active');
                    
                    const view = toggle.dataset.view;
                    if (this.canvas2D && this.canvas3D) {
                        this.canvas2D.classList.toggle('active', view === '2d');
                        this.canvas3D.classList.toggle('active', view === '3d');
                        this.resizeCanvases();
                    }
                });
            });
        }

        // Close button
        const closeButton = document.getElementById('close-mission-planner');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                if (this.popup) {
                    this.popup.classList.remove('active');
                    setTimeout(() => {
                        this.popup.style.display = 'none';
                    }, 300);
                }
            });
        }

        // Keyframe controls
        const addKeyframeBtn = document.getElementById('add-keyframe');
        if (addKeyframeBtn) {
            addKeyframeBtn.addEventListener('click', () => {
                const selectedDrone = document.querySelector('.drone-item.selected');
                if (!selectedDrone) {
                    customAlert.warning('Please select a drone first');
                    return;
                }

                const droneId = selectedDrone.dataset.droneId;
                const position = {
                    x: parseFloat(document.getElementById('wp-x')?.value) || 0,
                    y: parseFloat(document.getElementById('wp-y')?.value) || 0,
                    z: parseFloat(document.getElementById('wp-alt')?.value) || 2
                };
                const heading = ((parseFloat(document.getElementById('wp-heading')?.value) || 0) * Math.PI / 180);
                
                this.addKeyframe(droneId, position, heading);
            });
        }

        // Waypoint input handlers
        ['wp-x', 'wp-y', 'wp-alt'].forEach(inputId => {  // Removed wp-heading
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('change', () => {
                    const selectedDrone = document.querySelector('.drone-item.selected');
                    if (!selectedDrone) return;

                    const droneId = selectedDrone.dataset.droneId;
                    const frames = this.keyframes.get(droneId);
                    if (frames && frames[this.currentKeyframe]) {
                        const frame = frames[this.currentKeyframe];
                        const value = parseFloat(input.value) || 0;
                        
                        switch(inputId) {
                            case 'wp-x':
                                frame.position.x = value;
                                break;
                            case 'wp-y':
                                frame.position.y = value;
                                break;
                            case 'wp-alt':
                                frame.position.z = value;
                                break;
                        }
                        
                        this.updateViews();
                        this.updateKeyframeList();
                    }
                });
            }
        });

        // Playback controls
        const playButton = document.getElementById('play-mission');
        if (playButton) {
            playButton.addEventListener('click', () => this.playKeyframes());
        }

        const stopButton = document.getElementById('stop-mission');
        if (stopButton) {
            stopButton.addEventListener('click', () => this.stopKeyframes());
        }

        const speedInput = document.getElementById('playback-speed');
        if (speedInput) {
            speedInput.addEventListener('change', () => {
                this.playbackSpeed = parseInt(speedInput.value) || 1000;
            });
        }

        const keyframeSlider = document.getElementById('keyframe-slider');
        if (keyframeSlider) {
            keyframeSlider.addEventListener('input', () => {
                this.currentKeyframe = parseInt(keyframeSlider.value);
                this.updateViews();
                this.updateKeyframeCounter();
            });
        }

        // Mission file controls
        const loadButton = document.getElementById('load-mission');
        const loadInput = document.createElement('input');
        loadInput.type = 'file';
        loadInput.accept = '.json';
        loadInput.style.display = 'none';
        document.body.appendChild(loadInput);

        if (loadButton) {
            loadButton.addEventListener('click', () => {
                loadInput.value = ''; // Clear the input
                loadInput.click();
            });
            loadInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.loadMission(file);
                }
            });
        }

        const saveButton = document.getElementById('save-mission');
        if (saveButton) {
            saveButton.addEventListener('click', () => {
                if (this.keyframes.size === 0) {
                    customAlert.warning('No mission data to save');
                    return;
                }
                this.saveMission();
            });
        }

        const clearButton = document.getElementById('clear-mission');
        if (clearButton) {
            clearButton.addEventListener('click', () => this.clearMission());
        }

        // Window resize handler
        window.addEventListener('resize', () => this.resizeCanvases());

        // Add mission dropdown listener
        const missionDropdown = document.querySelector('.program-select');
        if (missionDropdown) {
            missionDropdown.addEventListener('click', async () => {
                await loadMissionsFromFolder();
            });
        }
    }

    resizeCanvases() {
        const container = document.querySelector('.view-container');
        if (!container || !this.canvas2D || !this.canvas3D) {
            console.warn('Required elements not found for resizing canvases');
            return;
        }

        const width = container.clientWidth;
        const height = container.clientHeight;

        // Resize 2D canvas
        this.canvas2D.width = width;
        this.canvas2D.height = height;
        this.update2DView();

        // Resize 3D canvas
        if (this.renderer) {
            this.renderer.setSize(width, height);
            if (this.camera) {
                this.camera.aspect = width / height;
                this.camera.updateProjectionMatrix();
            }
            this.update3DView();
        }
    }

    updateKeyframeSlider() {
        const slider = document.getElementById('keyframe-slider');
        const maxFrames = Math.max(...Array.from(this.keyframes.values()).map(k => k.length - 1));
        slider.max = maxFrames;
        slider.value = this.currentKeyframe;
        this.updateKeyframeCounter();
        this.updateKeyframeList();
    }

    updateKeyframeCounter() {
        const counter = document.getElementById('keyframe-counter');
        const maxFrames = Math.max(...Array.from(this.keyframes.values()).map(k => k.length));
        counter.textContent = `${this.currentKeyframe + 1} / ${maxFrames}`;
        this.updateCommandList(); // Add this line to update command list when keyframe changes
    }

    updateAvailableDrones() {
        if (!this.droneList) {
            console.warn('Drone list element not found');
            return;
        }
        
        this.droneList.innerHTML = '';

        this.defaultDrones.forEach(droneId => {
            const droneItem = document.createElement('div');
            droneItem.className = 'drone-item';
            droneItem.dataset.droneId = droneId;
            droneItem.style.borderColor = this.getDroneColor(droneId);
            droneItem.innerHTML = `
                <span class="drone-id">${droneId}</span>
                <span class="drone-status"></span>
            `;

            droneItem.addEventListener('click', () => {
                // Remove selection from all drones
                document.querySelectorAll('.drone-item').forEach(item => {
                    item.classList.remove('selected');
                });
                
                // Add selection to clicked drone
                droneItem.classList.add('selected');

                // Update input fields with current drone position
                const frames = this.keyframes.get(droneId);
                if (frames && frames[this.currentKeyframe]) {
                    const frame = frames[this.currentKeyframe];
                    const inputs = {
                        'wp-x': frame.position.x,
                        'wp-y': frame.position.y,
                        'wp-alt': frame.position.z,
                        'wp-heading': (frame.heading * 180 / Math.PI)
                    };

                    // Update each input field with animation
                    Object.entries(inputs).forEach(([id, value]) => {
                        const input = document.getElementById(id);
                        if (input) {
                            input.value = value.toFixed(1);
                            input.classList.add('updated');
                            setTimeout(() => input.classList.remove('updated'), 500);
                        }
                    });
                }

                // Highlight current drone's position in keyframe list
                document.querySelectorAll('.drone-position').forEach(pos => {
                    pos.classList.toggle('highlighted', pos.querySelector('.drone-id').textContent === droneId);
                });
            });

            this.droneList.appendChild(droneItem);
        });

        // Select first drone by default if none selected
        if (!document.querySelector('.drone-item.selected')) {
            this.droneList.firstElementChild?.click();
        }
    }

    initializeDefaultDrones() {
        // Create default keyframe with initial values for each drone
        this.defaultDrones.forEach((droneId, index) => {
            // Calculate offset positions - arranging drones in a line with 1m spacing
            const defaultKeyframe = {
                position: { 
                    x: index * 1, // Space them 1m apart on X axis
                    y: 0,        // Same Y position
                    z: 2         // Default 2m altitude
                },
                heading: 0,
                timestamp: Date.now()
            };
            
            // Set single keyframe for each drone
            this.keyframes.set(droneId, [defaultKeyframe]);
            
            // Create drone marker for 2D view
            const marker = {
                position: { x: index * 1, y: 0 },
                heading: 0,
                color: this.getDroneColor(droneId)
            };
            this.droneMarkers.set(droneId, marker);
        });

        // Update UI after initialization
        this.currentKeyframe = 0;
        this.updateKeyframeSlider();
        this.updateKeyframeCounter();
        this.updateKeyframeList();
    }

    getDroneColor(droneId) {
        const colors = {
            'MCU': '#70c172', // Green
            'CD1': '#2c7bf2', // Blue
            'CD2': '#f05151', // Red
            'CD3': '#ffab49', // Orange
            'CD4': '#9c27b0', // Purple
            'CD5': '#00bcd4'  // Cyan
        };
        return colors[droneId] || '#ffffff';
    }

    show() {
        if (!this.popup) {
            console.warn('Mission planner popup element not found');
            return;
        }

        this.popup.style.display = 'flex';
        setTimeout(() => {
            this.popup.classList.add('active');
            if (!this.scene) {
                this.initialize3DScene();
            }
            this.updateAvailableDrones();
            this.resizeCanvases();
        }, 10);
    }

    initialize3DScene() {
        try {
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x091930);
            
            this.camera = new THREE.PerspectiveCamera(
                75,
                this.canvas3D.clientWidth / this.canvas3D.clientHeight,
                0.1,
                1000
            );
            
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas3D,
                antialias: true,
                alpha: true
            });
            
            this.controls = new THREE.OrbitControls(this.camera, this.canvas3D);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
            
            // Lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
            directionalLight.position.set(10, 10, 10);
            this.scene.add(ambientLight);
            this.scene.add(directionalLight);
            
            this.camera.position.set(20, 20, 20);
            this.camera.lookAt(0, 0, 0);
            
            // Add meter grid
            const gridHelper = new THREE.GridHelper(this.gridSize, this.gridSize, 0x70c172, 0x1c2b40);
            this.scene.add(gridHelper);
            
            // Add axis helper
            const axisHelper = new THREE.AxesHelper(5);
            this.scene.add(axisHelper);
            
            // Initialize drone models
            this.initializeDroneModels();
            
            this.animate();
            this.resizeCanvases();
        } catch (error) {
            console.error('Error initializing 3D scene:', error);
        }
    }

    animate = () => {
        if (!this.renderer || !this.scene || !this.camera) return;
        
        requestAnimationFrame(this.animate);
        
        // Update controls
        if (this.controls) {
            this.controls.update();
        }
        
        // Render scene
        this.renderer.render(this.scene, this.camera);
    }

    initializeDroneModels() {
        this.defaultDrones.forEach(droneId => {
            // Create simple drone model (cone + cylinder)
            const droneGroup = new THREE.Group();
            
            // Body (cylinder)
            const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8);
            const bodyMaterial = new THREE.MeshPhongMaterial({ color: this.getDroneColor(droneId) });
            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            droneGroup.add(body);
            
            // Direction indicator (cone)
            const directionGeometry = new THREE.ConeGeometry(0.2, 0.4, 8);
            const directionMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
            const direction = new THREE.Mesh(directionGeometry, directionMaterial);
            direction.position.set(0, 0, 0.3);
            direction.rotation.x = Math.PI / 2;
            droneGroup.add(direction);
            
            this.droneModels.set(droneId, droneGroup);
            this.scene.add(droneGroup);
        });
    }

    update2DView() {
        if (!this.ctx2D) return;
        
        // Clear canvas
        this.ctx2D.clearRect(0, 0, this.canvas2D.width, this.canvas2D.height);
        
        // Calculate center of canvas
        const centerX = this.canvas2D.width / 2;
        const centerY = this.canvas2D.height / 2;
        
        // Save context state
        this.ctx2D.save();
        
        // Apply zoom transformation
        this.ctx2D.translate(centerX, centerY);
        this.ctx2D.scale(this.zoomLevel, this.zoomLevel);
        this.ctx2D.translate(-centerX, -centerY);
        
        // Draw grid
        this.ctx2D.strokeStyle = '#1c2b40';
        this.ctx2D.lineWidth = 1 / this.zoomLevel;
        
        // Draw vertical grid lines
        for (let x = -this.gridSize/2; x <= this.gridSize/2; x += this.gridSpacing) {
            const screenX = centerX + x * this.pixelsPerMeter;
            this.ctx2D.beginPath();
            this.ctx2D.moveTo(screenX, 0);
            this.ctx2D.lineTo(screenX, this.canvas2D.height);
            this.ctx2D.stroke();
        }
        
        // Draw horizontal grid lines
        for (let y = -this.gridSize/2; y <= this.gridSize/2; y += this.gridSpacing) {
            const screenY = centerY + y * this.pixelsPerMeter;
            this.ctx2D.beginPath();
            this.ctx2D.moveTo(0, screenY);
            this.ctx2D.lineTo(this.canvas2D.width, screenY);
            this.ctx2D.stroke();
        }
        
        // Draw axes
        this.ctx2D.strokeStyle = '#70c172';
        this.ctx2D.lineWidth = 2 / this.zoomLevel;
        
        // X-axis
        this.ctx2D.beginPath();
        this.ctx2D.moveTo(0, centerY);
        this.ctx2D.lineTo(this.canvas2D.width, centerY);
        this.ctx2D.stroke();
        
        // Y-axis
        this.ctx2D.beginPath();
        this.ctx2D.moveTo(centerX, 0);
        this.ctx2D.lineTo(centerX, this.canvas2D.height);
        this.ctx2D.stroke();

        // Draw paths between keyframes for each drone
        this.droneMarkers.forEach((marker, droneId) => {
            const frames = this.keyframes.get(droneId);
            if (frames && frames.length > 1) {
                // Set path style based on drone color with transparency
                this.ctx2D.strokeStyle = marker.color.replace(')', ', 0.3)').replace('rgb', 'rgba');
                this.ctx2D.lineWidth = 2 / this.zoomLevel;
                this.ctx2D.setLineDash([5 / this.zoomLevel, 5 / this.zoomLevel]);

                // Draw path through all keyframes
                this.ctx2D.beginPath();
                frames.forEach((frame, index) => {
                    const screenX = centerX + frame.position.x * this.pixelsPerMeter;
                    const screenY = centerY - frame.position.y * this.pixelsPerMeter;
                    
                    if (index === 0) {
                        this.ctx2D.moveTo(screenX, screenY);
                    } else {
                        this.ctx2D.lineTo(screenX, screenY);
                    }
                });
                this.ctx2D.stroke();
                this.ctx2D.setLineDash([]); // Reset line dash

                // Draw waypoint markers at each keyframe
                frames.forEach((frame, index) => {
                    const screenX = centerX + frame.position.x * this.pixelsPerMeter;
                    const screenY = centerY - frame.position.y * this.pixelsPerMeter;
                    
                    // Draw waypoint circle
                    this.ctx2D.fillStyle = marker.color.replace(')', ', 0.2)').replace('rgb', 'rgba');
                    this.ctx2D.strokeStyle = marker.color;
                    this.ctx2D.lineWidth = 1 / this.zoomLevel;
                    this.ctx2D.beginPath();
                    this.ctx2D.arc(screenX, screenY, 8 / this.zoomLevel, 0, Math.PI * 2);
                    this.ctx2D.fill();
                    this.ctx2D.stroke();

                    // Draw waypoint number
                    this.ctx2D.fillStyle = '#ffffff';
                    this.ctx2D.font = `${10 / this.zoomLevel}px IBM Plex Mono`;
                    this.ctx2D.textAlign = 'center';
                    this.ctx2D.textBaseline = 'middle';
                    this.ctx2D.fillText(index + 1, screenX, screenY);
                });
            }
        });
        
        // Draw drone markers
        this.droneMarkers.forEach((marker, droneId) => {
            const screenX = centerX + marker.position.x * this.pixelsPerMeter;
            const screenY = centerY - marker.position.y * this.pixelsPerMeter;
            
            // Draw drone circle
            this.ctx2D.fillStyle = marker.color;
            this.ctx2D.beginPath();
            this.ctx2D.arc(screenX, screenY, 5 / this.zoomLevel, 0, Math.PI * 2);
            this.ctx2D.fill();
            
            // Draw heading indicator
            const headingX = screenX + Math.cos(marker.heading) * (10 / this.zoomLevel);
            const headingY = screenY - Math.sin(marker.heading) * (10 / this.zoomLevel);
            this.ctx2D.beginPath();
            this.ctx2D.moveTo(screenX, screenY);
            this.ctx2D.lineTo(headingX, headingY);
            this.ctx2D.stroke();
            
            // Draw drone ID
            this.ctx2D.fillStyle = '#ffffff';
            this.ctx2D.font = `${12 / this.zoomLevel}px IBM Plex Mono`;
            this.ctx2D.fillText(droneId, screenX + (10 / this.zoomLevel), screenY - (10 / this.zoomLevel));
        });
        
        // Restore context state
        this.ctx2D.restore();
    }

    update3DView() {
        if (!this.scene) return;
        
        // Update drone models
        this.droneModels.forEach((model, droneId) => {
            const keyframes = this.keyframes.get(droneId);
            if (keyframes && keyframes.length > 0) {
                const frame = keyframes[this.currentKeyframe] || keyframes[0];
                model.position.set(frame.position.x, frame.position.z, -frame.position.y);
                model.rotation.y = -frame.heading;
            }
        });
        
        this.renderer.render(this.scene, this.camera);
    }

    addKeyframe(droneId, position, heading) {
        if (!this.keyframes.has(droneId)) {
            console.warn(`No keyframes found for drone ${droneId}`);
            this.keyframes.set(droneId, []);
        }

        // For each drone, create a new keyframe
        this.defaultDrones.forEach(currentDroneId => {
            if (!this.keyframes.has(currentDroneId)) {
                this.keyframes.set(currentDroneId, []);
            }

            const frames = this.keyframes.get(currentDroneId);
            if (frames.length >= this.maxKeyframes) {
                customAlert.warning(`Maximum keyframes (${this.maxKeyframes}) reached`);
                return;
            }

            // Get previous keyframe data or use defaults
            const prevFrame = frames[this.currentKeyframe] || {
                position: { x: 0, y: 0, z: 2 },
                heading: 0
            };

            // Create new keyframe
            let keyframe;
            if (currentDroneId === droneId) {
                // For the selected drone, calculate new position and relative values
                const newX = position.x !== undefined ? parseFloat(position.x) : prevFrame.position.x;
                const newY = position.y !== undefined ? parseFloat(position.y) : prevFrame.position.y;
                const newZ = position.z !== undefined ? parseFloat(position.z) : prevFrame.position.z;
                
                // Calculate dx and dy from previous position
                const dx = newX - prevFrame.position.x;
                const dy = newY - prevFrame.position.y;
                
                // Calculate heading based on movement direction
                let calculatedHeading = 0;
                if (dx !== 0 || dy !== 0) {
                    calculatedHeading = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
                } else {
                    calculatedHeading = prevFrame.heading || 0;
                }

                keyframe = {
                    position: { 
                        x: newX,
                        y: newY,
                        z: newZ
                    },
                    dx: parseFloat(dx.toFixed(2)),
                    dy: parseFloat(dy.toFixed(2)),
                    heading: parseFloat(calculatedHeading.toFixed(1)),
                    delay: prevFrame.delay || 1000
                };

                // Ensure all values are numbers and not NaN
                Object.entries(keyframe.position).forEach(([key, value]) => {
                    keyframe.position[key] = isNaN(value) ? prevFrame.position[key] : value;
                });
                keyframe.dx = isNaN(keyframe.dx) ? 0 : keyframe.dx;
                keyframe.dy = isNaN(keyframe.dy) ? 0 : keyframe.dy;
                keyframe.heading = isNaN(keyframe.heading) ? prevFrame.heading : keyframe.heading;
                keyframe.delay = isNaN(keyframe.delay) ? 1000 : keyframe.delay;
            } else {
                // For other drones, copy the previous keyframe exactly
                keyframe = {
                    position: { ...prevFrame.position },
                    dx: 0,
                    dy: 0,
                    heading: prevFrame.heading || 0,
                    delay: prevFrame.delay || 1000
                };
            }

            // Insert keyframe after current position
            frames.splice(this.currentKeyframe + 1, 0, keyframe);

            // Update visual representations
            if (currentDroneId === droneId) {
                // Update drone marker position for 2D view
                const marker = this.droneMarkers.get(currentDroneId);
                if (marker) {
                    marker.position.x = keyframe.position.x;
                    marker.position.y = keyframe.position.y;
                    marker.heading = keyframe.heading;
                }

                // Update drone model position for 3D view
                const model = this.droneModels.get(currentDroneId);
                if (model) {
                    model.position.set(keyframe.position.x, keyframe.position.z, -keyframe.position.y);
                    model.rotation.y = -keyframe.heading * (Math.PI / 180);
                }
            }
        });

        // Move to the newly inserted keyframe
        this.currentKeyframe++;

        // Update UI
        this.updateViews();
        this.updateKeyframeSlider();
        this.updateKeyframeCounter();
        this.updateKeyframeList();

        // Update input fields for the selected drone
        const selectedDroneFrames = this.keyframes.get(droneId);
        if (selectedDroneFrames && selectedDroneFrames[this.currentKeyframe]) {
            this.updateWaypointInputs(selectedDroneFrames[this.currentKeyframe]);
        }
    }

    updateWaypointInputs(keyframe) {
        const inputs = {
            'wp-x': keyframe.position.x,
            'wp-y': keyframe.position.y,
            'wp-alt': keyframe.position.z
        };

        Object.entries(inputs).forEach(([id, value]) => {
            const input = document.getElementById(id);
            if (input) {
                input.value = value.toFixed(1);
                input.classList.add('updated');
                setTimeout(() => input.classList.remove('updated'), 500);
            }
        });
    }

    updateKeyframeList() {
        this.keyframeList.innerHTML = '';
        
        // Get maximum frames across all drones
        let maxFrames = 0;
        this.keyframes.forEach(frames => {
            maxFrames = Math.max(maxFrames, frames.length);
        });

        // Store existing delay values before updating
        const existingDelays = new Map();
        const delayInputs = document.querySelectorAll('.frame-wrapper');
        delayInputs.forEach((wrapper, index) => {
            const input = wrapper.querySelector('.delay-input');
            if (input) {
                existingDelays.set(index, parseInt(input.value) || 1000);
            }
        });

        // Create frame elements
        for (let i = 0; i < maxFrames; i++) {
            const frameWrapper = document.createElement('div');
            frameWrapper.className = 'frame-wrapper';
            
            const frameContainer = document.createElement('div');
            frameContainer.className = 'keyframe-container';
            if (i === this.currentKeyframe) {
                frameContainer.classList.add('current');
            }

            // Frame header
            const frameHeader = document.createElement('div');
            frameHeader.className = 'frame-header';
            frameHeader.innerHTML = `
                <span class="frame-title">Frame <span class="frame-number">${i + 1}</span></span>
                <div class="frame-actions">
                    <button class="frame-btn edit-frame">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="frame-btn delete-frame">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;

            // Drone positions
            const dronePositions = document.createElement('div');
            dronePositions.className = 'drone-positions';

            this.defaultDrones.forEach(droneId => {
                const frames = this.keyframes.get(droneId);
                if (frames && frames[i]) {
                    const frame = frames[i];
                    const dronePosition = document.createElement('div');
                    dronePosition.className = 'drone-position';
                    dronePosition.innerHTML = `
                        <span class="drone-id">${droneId}</span>
                        <span class="position">X: ${frame.position.x.toFixed(1)}, Y: ${frame.position.y.toFixed(1)}, Z: ${frame.position.z.toFixed(1)}</span>
                        <span class="heading">H: ${(frame.heading * 180 / Math.PI).toFixed(0)}°</span>
                        <button class="edit-drone">Edit</button>
                    `;
                    dronePositions.appendChild(dronePosition);
                }
            });

            // Add custom commands to frame if they exist
            const commands = this.customCommands.get(i);
            if (commands && commands.length > 0) {
                const commandsContainer = document.createElement('div');
                commandsContainer.className = 'frame-commands';
                commandsContainer.innerHTML = '<div class="commands-header">Commands:</div>';
                
                commands.forEach(cmd => {
                    const cmdElement = document.createElement('div');
                    cmdElement.className = 'frame-command';
                    
                    let displayPayload = cmd.payload;
                    if (cmd.command === 'LIGHT') {
                        displayPayload = `<span class="color-preview" style="background-color: #${cmd.payload}"></span>`;
                    }
                    
                    cmdElement.innerHTML = `
                        <span class="command-drone">${cmd.droneId}</span>
                        <span class="command-name">${cmd.command}</span>
                        <span class="command-payload">${displayPayload}</span>
                    `;
                    commandsContainer.appendChild(cmdElement);
                });
                dronePositions.appendChild(commandsContainer);
            }

            frameContainer.appendChild(frameHeader);
            frameContainer.appendChild(dronePositions);
            frameWrapper.appendChild(frameContainer);

            // Frame delay (now outside the keyframe container)
            const delayContainer = document.createElement('div');
            delayContainer.className = 'frame-delay-container';
            
            // Use existing delay value if available, otherwise use previous frame's delay or 1000
            let delayValue;
            if (existingDelays.has(i)) {
                delayValue = existingDelays.get(i);
            } else if (existingDelays.has(i - 1)) {
                delayValue = existingDelays.get(i - 1);
            } else {
                delayValue = 1000;
            }
            
            delayContainer.innerHTML = `
                <div class="delay-input-container">
                    <input type="number" class="delay-input" value="${delayValue}" min="100" max="100000" step="100">
                    <span class="delay-unit">ms</span>
                </div>
            `;
            frameWrapper.appendChild(delayContainer);

            this.keyframeList.appendChild(frameWrapper);

            // Add event listeners
            frameContainer.querySelector('.edit-frame').addEventListener('click', () => this.editFrame(i));
            frameContainer.querySelector('.delete-frame').addEventListener('click', () => this.deleteFrame(i));
            frameContainer.querySelectorAll('.edit-drone').forEach(btn => {
                const droneId = btn.parentElement.querySelector('.drone-id').textContent;
                btn.addEventListener('click', () => this.editDroneInFrame(droneId, i));
            });
        }

        // Add CSS for frame wrapper and delay container
        const style = document.createElement('style');
        style.textContent = `
            .frame-wrapper {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 10px;
            }
            .keyframe-container {
                flex: 1;
            }
            .frame-delay-container {
                min-width: 120px;
                padding: 5px;
                background: #1a1a1a;
                border-radius: 4px;
            }
            .delay-input-container {
                display: flex;
                align-items: center;
                gap: 5px;
            }
            .delay-input {
                width: 70px;
                padding: 4px;
                background: #2a2a2a;
                color: white;
                border: 1px solid #444;
                border-radius: 4px;
            }
            .delay-unit {
                color: #888;
                font-size: 0.9em;
            }
            // ... existing styles ...
        `;
        document.head.appendChild(style);
    }

    // Helper method to get frame delay
    getFrameDelay(frameIndex) {
        // Get delay from any drone's frame (they should all be the same)
        for (const frames of this.keyframes.values()) {
            if (frames && frames[frameIndex]) {
                return frames[frameIndex].delay || 1000;
            }
        }
        return 1000; // Default delay
    }

    // Add these new methods to handle editing
    editFrame(frameIndex) {
        // Set current frame
        this.currentKeyframe = frameIndex;
        
        // Update UI to show current frame is selected
        this.updateViews();
        this.updateKeyframeSlider();
        this.updateKeyframeCounter();
        this.updateKeyframeList();
        
        // Load the first drone's data into input fields
        const selectedDrone = document.querySelector('.drone-item.selected');
        if (selectedDrone) {
            const droneId = selectedDrone.dataset.droneId;
            const frames = this.keyframes.get(droneId);
            if (frames && frames[frameIndex]) {
                this.updateWaypointInputs(frames[frameIndex]);
            }
        }
    }

    deleteFrame(frameIndex) {
        if (confirm(`Are you sure you want to delete Frame ${frameIndex + 1}?`)) {
            // Delete frame from all drones
            this.defaultDrones.forEach(droneId => {
                const frames = this.keyframes.get(droneId);
                if (frames && frames.length > frameIndex) {
                    frames.splice(frameIndex, 1);
                }
            });
            
            // Update current frame if needed
            if (this.currentKeyframe >= frameIndex) {
                this.currentKeyframe = Math.max(0, this.currentKeyframe - 1);
            }
            
            // Update UI
            this.updateViews();
            this.updateKeyframeSlider();
            this.updateKeyframeCounter();
            this.updateKeyframeList();
        }
    }

    editDroneInFrame(droneId, frameIndex) {
        // Select the drone
        const droneItems = document.querySelectorAll('.drone-item');
        droneItems.forEach(item => {
            item.classList.toggle('selected', item.dataset.droneId === droneId);
        });
        
        // Set current frame
        this.currentKeyframe = frameIndex;
        
        // Load drone data into input fields
        const frames = this.keyframes.get(droneId);
        if (frames && frames[frameIndex]) {
            this.updateWaypointInputs(frames[frameIndex]);
        }
        
        // Update UI
        this.updateViews();
        this.updateKeyframeSlider();
        this.updateKeyframeCounter();
        this.updateKeyframeList();
    }

    playKeyframes() {
        if (this.isPlaying) return;
        this.isPlaying = true;

        const animate = async () => {
            if (!this.isPlaying) return;

            // Execute custom commands for current frame
            const commands = this.customCommands.get(this.currentKeyframe) || [];
            for (const cmd of commands) {
                await send_command(cmd.droneId, cmd.command, cmd.payload);
            }

            // Get maximum frames across all drones
            let maxFrames = 0;
            this.keyframes.forEach(frames => {
                maxFrames = Math.max(maxFrames, frames.length);
            });

            // If we're at the last frame, stop playback
            if (this.currentKeyframe >= maxFrames - 1) {
                this.stopKeyframes();
                return;
            }

            // Get the delay from the frame-delay-container input
            const delayInput = document.querySelector(`.frame-wrapper:nth-child(${this.currentKeyframe + 1}) .delay-input`);
            const frameDelay = delayInput ? parseInt(delayInput.value) : 1000;

            // Interpolate positions for all drones
            const startTime = Date.now();
            const animate3DTransition = () => {
                if (!this.isPlaying) return;

                const currentTime = Date.now() - startTime;
                const progress = Math.min(currentTime / frameDelay, 1);

                // Use easing function for smoother motion
                const easedProgress = this.easeInOutCubic(progress);

                // Update each drone's position
                this.defaultDrones.forEach(droneId => {
                    const frames = this.keyframes.get(droneId);
                    if (frames && frames[this.currentKeyframe] && frames[this.currentKeyframe + 1]) {
                        const startPos = frames[this.currentKeyframe].position;
                        const endPos = frames[this.currentKeyframe + 1].position;
                        const startHeading = frames[this.currentKeyframe].heading;
                        const endHeading = frames[this.currentKeyframe + 1].heading;

                        // Interpolate position and heading with easing
                        const currentPos = {
                            x: this.lerp(startPos.x, endPos.x, easedProgress),
                            y: this.lerp(startPos.y, endPos.y, easedProgress),
                            z: this.lerp(startPos.z, endPos.z, easedProgress)
                        };
                        const currentHeading = this.lerpAngle(startHeading, endHeading, easedProgress);

                        // Update marker position for 2D view
                        const marker = this.droneMarkers.get(droneId);
                        if (marker) {
                            marker.position.x = currentPos.x;
                            marker.position.y = currentPos.y;
                            marker.heading = currentHeading;
                        }

                        // Update 3D model position
                        const model = this.droneModels.get(droneId);
                        if (model) {
                            model.position.set(currentPos.x, currentPos.z, -currentPos.y);
                            model.rotation.y = -currentHeading;
                        }
                    }
                });

                // Update views
                this.updateViews();

                // Continue animation if not complete
                if (progress < 1) {
                    requestAnimationFrame(animate3DTransition);
                } else {
                    // Move to next frame
                    this.currentKeyframe++;
                    this.updateKeyframeSlider();
                    this.updateKeyframeCounter();
                    this.updateKeyframeList();
                    
                    // Continue to next frame after a small delay
                    setTimeout(() => {
                        animate();
                    }, 100); // Small delay between frames for better visualization
                }
            };

            // Start transition animation
            animate3DTransition();
        };

        animate();
    }

    // Easing function for smoother motion
    easeInOutCubic(t) {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // Linear interpolation helper
    lerp(start, end, t) {
        return start * (1 - t) + end * t;
    }

    // Angle interpolation helper
    lerpAngle(start, end, t) {
        const diff = end - start;
        const adjusted = ((diff + Math.PI) % (2 * Math.PI)) - Math.PI;
        return start + adjusted * t;
    }

    stopKeyframes() {
        this.isPlaying = false;
        this.currentKeyframe = 0;
        this.updateViews();
    }

    saveMission() {
        const missionData = {
            version: "1.0",
            timestamp: Date.now(),
            settings: {
                gridSize: this.gridSize,
                gridSpacing: this.gridSpacing
            },
            drones: {},
            frameDelays: []
        };

        // Get maximum number of frames
        let maxFrames = 0;
        this.keyframes.forEach(frames => {
            maxFrames = Math.max(maxFrames, frames.length);
        });

        // Save frame delays
        for (let i = 0; i < maxFrames; i++) {
            const delayInput = document.querySelector(`.frame-wrapper:nth-child(${i + 1}) .delay-input`);
            missionData.frameDelays[i] = delayInput ? parseInt(delayInput.value) : 1000;
        }

        // Save drone keyframes with calculated dx, dy
        this.keyframes.forEach((frames, droneId) => {
            missionData.drones[droneId] = {
                color: this.getDroneColor(droneId),
                frames: frames.map((frame, index, frames) => {
                    // Calculate dx and dy from previous frame
                    let dx = 0, dy = 0;
                    if (index > 0) {
                        // Get position difference from previous frame
                        const prevFrame = frames[index - 1];
                        dx = frame.position.x - prevFrame.position.x;
                        dy = frame.position.y - prevFrame.position.y;
                    } else {
                        // For first frame, use absolute position
                        dx = frame.position.x;
                        dy = frame.position.y;
                    }

                    // Calculate heading based on movement direction
                    let heading = 0;
                    if (dx !== 0 || dy !== 0) {
                        heading = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
                    }

                    return {
                        position: {
                            x: parseFloat(frame.position.x.toFixed(2)),
                            y: parseFloat(frame.position.y.toFixed(2)),
                            z: parseFloat(frame.position.z.toFixed(2))
                        },
                        dx: parseFloat(dx.toFixed(2)),
                        dy: parseFloat(dy.toFixed(2)),
                        heading: parseFloat(heading.toFixed(1)),
                        delay: frame.delay || 1000
                    };
                })
            };
        });

        // Save custom commands
        if (this.customCommands.size > 0) {
            missionData.customCommands = Array.from(this.customCommands.entries()).map(([frameIndex, commands]) => {
                return [frameIndex, commands.map(cmd => ({
                    droneId: cmd.droneId,
                    command: cmd.command,
                    payload: cmd.payload
                }))];
            });
        }

        // Save mission file
        const blob = new Blob([JSON.stringify(missionData, null, 2)], { type: 'application/json' });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `swarm_mission_${timestamp}.json`;
        
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    loadMission(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const missionData = JSON.parse(e.target.result);
                
                // Clear existing data
                this.keyframes.clear();
                this.customCommands.clear();
                
                // Load drone keyframes
                Object.entries(missionData.drones).forEach(([droneId, data]) => {
                    const frames = data.frames.map((frame, index, frames) => {
                        // Get previous frame for dx/dy calculation
                        const prevFrame = index > 0 ? frames[index - 1] : null;
                        
                        // Calculate dx and dy from position differences
                        let dx = 0, dy = 0;
                        if (prevFrame) {
                            dx = frame.position.x - prevFrame.position.x;
                            dy = frame.position.y - prevFrame.position.y;
                        } else {
                            // For first frame, use absolute position as displacement
                            dx = frame.position.x;
                            dy = frame.position.y;
                        }

                        // Calculate heading based on movement direction
                        let heading = 0;
                        if (dx !== 0 || dy !== 0) {
                            heading = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
                        }

                        return {
                            position: {
                                x: frame.position.x,
                                y: frame.position.y,
                                z: frame.position.z
                            },
                            dx: parseFloat(dx.toFixed(2)),
                            dy: parseFloat(dy.toFixed(2)),
                            heading: parseFloat(heading.toFixed(1)),
                            delay: frame.delay || 1000
                        };
                    });
                    
                    this.keyframes.set(droneId, frames);
                });
                
                // Load custom commands if they exist
                if (missionData.customCommands) {
                    missionData.customCommands.forEach(([frameIndex, commands]) => {
                        this.customCommands.set(frameIndex, commands);
                    });
                }
                
                // Reset to first keyframe
                this.currentKeyframe = 0;
                this.isPlaying = false;
                
                // Update UI
                this.updateKeyframeSlider();
                this.updateKeyframeCounter();
                this.updateKeyframeList();
                
                // After updating keyframe list, set the frame delays
                if (missionData.frameDelays) {
                    missionData.frameDelays.forEach((delay, index) => {
                        const delayInput = document.querySelector(`.frame-wrapper:nth-child(${index + 1}) .delay-input`);
                        if (delayInput) {
                            delayInput.value = delay;
                        }
                    });
                }
                
                this.updateViews();
                this.updateCommandList();
                
                customAlert.success('Mission loaded successfully');
            } catch (error) {
                console.error('Error loading mission:', error);
                customAlert.error('Failed to load mission: ' + error.message);
            }
        };
        reader.readAsText(file);
    }

    clearMission() {
        this.keyframes.clear();
        this.initializeDefaultDrones();
        this.currentKeyframe = 0;
        this.isPlaying = false;
        this.updateViews();
        this.customCommands.clear();
        this.updateCommandList();
    }

    updateViews() {
        this.update2DView();
        this.update3DView();
    }

    handleZoom(event) {
        event.preventDefault();
        
        // Calculate new zoom level
        const delta = event.deltaY > 0 ? -this.zoomStep : this.zoomStep;
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel + delta));
        
        // Only update if zoom level changed
        if (newZoom !== this.zoomLevel) {
            this.zoomLevel = newZoom;
            this.update2DView();
        }
    }

    // ... (keep existing methods for handling mouse events, etc.)

    addCustomCommand(frameIndex, droneId, command, payload) {
        if (!this.customCommands.has(frameIndex)) {
            this.customCommands.set(frameIndex, []);
        }
        
        this.customCommands.get(frameIndex).push({
            droneId,
            command,
            payload
        });
    }

    updateCommandList() {
        const commandList = document.querySelector('.command-list');
        if (!commandList) return;
        
        commandList.innerHTML = '';
        const commands = this.customCommands.get(this.currentKeyframe) || [];
        
        if (commands.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'command-item empty';
            emptyMessage.innerHTML = '<span style="color: #666; text-align: center; width: 100%;">No commands for this keyframe</span>';
            commandList.appendChild(emptyMessage);
            return;
        }

        commands.forEach((cmd, index) => {
            const cmdElement = document.createElement('div');
            cmdElement.className = 'command-item';
            
            let displayPayload = cmd.payload;
            if (cmd.command === 'LIGHT') {
                displayPayload = `<span class="color-preview" style="background-color: #${cmd.payload}"></span>`;
            }

            cmdElement.innerHTML = `
                <span class="command-drone">${cmd.droneId}</span>
                <span class="command-name">${cmd.command}</span>
                <span class="command-payload">${displayPayload}</span>
                <button class="delete-command" data-index="${index}" title="Delete command">×</button>
            `;

            cmdElement.querySelector('.delete-command').addEventListener('click', () => {
                this.customCommands.get(this.currentKeyframe).splice(index, 1);
                this.updateCommandList();
                customAlert.success('Command deleted');
            });

            commandList.appendChild(cmdElement);
        });
    }

    initializeKeyboardControls() {
        // Add toggle button handler
        const toggleBtn = document.getElementById('keyboard-control-toggle');
        toggleBtn.addEventListener('click', () => {
            this.keyboardControlEnabled = !this.keyboardControlEnabled;
            toggleBtn.textContent = `Keyboard Control: ${this.keyboardControlEnabled ? 'ON' : 'OFF'}`;
            toggleBtn.classList.toggle('active', this.keyboardControlEnabled);
        });

        // Add keyboard event listener
        document.addEventListener('keydown', (event) => {
            // Only process if keyboard control is enabled and mission planner is active
            if (!this.keyboardControlEnabled) return;
            if (!document.querySelector('.mission-planner-popup') || 
                document.querySelector('.mission-planner-popup').style.display === 'none') return;

            // Get selected drone
            const selectedDroneElement = document.querySelector('.drone-item.selected');
            if (!selectedDroneElement) {
                console.log('No drone selected');
                return;
            }

            const droneId = selectedDroneElement.dataset.droneId;
            const frames = this.keyframes.get(droneId);
            if (!frames || !frames[this.currentKeyframe]) return;

            const currentFrame = frames[this.currentKeyframe];
            let positionChanged = false;

            // Clone current position
            const newPosition = { ...currentFrame.position };

            switch(event.key.toLowerCase()) {
                // X-axis controls (A/D)
                case 'a':
                    newPosition.x -= 1;
                    positionChanged = true;
                    break;
                case 'd':
                    newPosition.x += 1;
                    positionChanged = true;
                    break;

                // Y-axis controls (W/S)
                case 'w':
                    newPosition.y += 1;
                    positionChanged = true;
                    break;
                case 's':
                    newPosition.y -= 1;
                    positionChanged = true;
                    break;

                // Z-axis controls (U/J)
                case 'u':
                    newPosition.z += 1;
                    positionChanged = true;
                    break;
                case 'j':
                    newPosition.z -= 1;
                    positionChanged = true;
                    break;
            }

            if (positionChanged) {
                // Update position
                currentFrame.position = newPosition;

                // Update UI
                this.updateViews();
                this.updateWaypointInputs(currentFrame);

                // Show movement notification
                customAlert.show(`Moved ${droneId} to X: ${newPosition.x.toFixed(1)}, Y: ${newPosition.y.toFixed(1)}, Z: ${newPosition.z.toFixed(1)}`, 'info', 1000);
            }
        });
    }
}

// Initialize mission planner when menu item is clicked
document.getElementById('menu-missions').addEventListener('click', () => {
    if (!window.missionPlanner) {
        window.missionPlanner = new MissionPlanner();
    }
    if (!window.missionPlanner.popup && !window.missionPlanner.initialize()) {
        console.error('Failed to initialize mission planner');
        return;
    }
    window.missionPlanner.show();
});


// Function to send command to the drone
function send_command(target, command, payload) {
    // Convert target to uppercase to match ESP32 expectations
    const upperTarget = target.toUpperCase();
    const message = `{T:${upperTarget};C:${command};P:${payload}}`;
    console.log('Sending command:', message);
    
    fetch('http://127.0.0.1:5000/send_command', {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain'
        },
        body: message
    })
    .then(response => response.json())
    .then(data => {
        console.log('Command sent successfully:', data);
    })
    .catch(error => {
        console.error('Error sending command:', error);
        customAlert.error('Failed to send command');
    });
}

// Function to handle serial input
function serialInput() {
    const serialInputFields = document.querySelectorAll('.serial-input');
    serialInputFields.forEach(inputField => {
        const inputValue = inputField.value.trim(); // Get the value from the input field
        if (inputValue) {
            // Call the serialSend function with the input value
            serialSend(inputValue);
            // Clear the input field after sending
            inputField.value = '';
        }
    });
}

// Function to send the command based on the input value
function serialSend(valueString) {
    // Split the input string by semicolon
    const parts = valueString.split(';');

    // Ensure there are exactly three parts
    if (parts.length !== 3) {
        console.error('Input must contain exactly three parts separated by semicolons (target;command;payload)');
        customAlert.error('Invalid format. Use: target;command;payload');
        return;
    }

    const target = parts[0].trim();   // First part as target
    const command = parts[1].trim();  // Second part as command
    const payload = parts[2].trim();   // Third part as payload

    // Call the send_command function with the parsed values
    send_command(target, command, payload);
}

// Add event listeners to all serial-send buttons
document.addEventListener('DOMContentLoaded', () => {
    const serialSendButtons = document.querySelectorAll('.serial-send');
    const serialInputFields = document.querySelectorAll('.serial-input');

    serialSendButtons.forEach(button => {
        button.addEventListener('click', serialInput);
    });

    serialInputFields.forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                serialInput();
            }
        });
    });
});

// Function to handle data from the ESP terminal
async function handleESPTerminalData(data) {
    console.log('Received ESP terminal data:', data); // Debug log

    try {
        // Check if data is an array
        if (Array.isArray(data)) {
            data.forEach(message => {
                // Manually parse the custom format
                const parsedMsg = parseCustomMessageFormat(message);
                console.log('Parsed message:', parsedMsg); // Debug log

                // Process the message based on its type
                if (parsedMsg.C === 'HB') {
                    // Handle heartbeat message
                    handleHeartbeat(parsedMsg);
                } else if (parsedMsg.C === 'ATTITUDE') {
                    // Handle attitude message
                    handleAttitude(parsedMsg);
                }
                handleDroneMessage(parsedMsg); // Add this line to handle drone messages
                // Add more cases as needed
            });
        } else {
            console.error('Expected an array but received:', data);
        }
    } catch (error) {
        console.error('Error processing ESP terminal data:', error);
    }
}

// Function to fetch data from /esp-terminal
async function fetchSerialData() {
    try {
        const response = await fetch('http://127.0.0.1:5000/esp-terminal');
        if (!response.ok) throw new Error('Failed to fetch serial data');
        
        const data = await response.json();
        const terminal = document.querySelector('.esp-terminal-content');

        if (data && data.length > 0) {
            console.log('Received serial data:', data);
            displaySerialData(data);
            data.forEach(line => {
                handleESPTerminalData(line); // Handle each line of data
                handleDroneMessage(line); // Add this line to handle drone messages
            });
        }
        
        if (terminal && data.length > 0) {
            // Add new messages with formatting
            data.forEach(message => {
                terminal.innerHTML += formatTerminalMessage(message);
            });

            
            // Auto-scroll to bottom
            terminal.scrollTop = terminal.scrollHeight;
            
            // Keep only last 100 lines to prevent excessive memory usage
            const lines = terminal.getElementsByClassName('terminal-line');
            while (lines.length > 100) {
                lines[0].remove();
            }
        }
    } catch (error) {
        console.error('Error fetching serial data:', error);
    }
}

// Function to display serial data in the terminal
function displaySerialData(data) {
    const terminal = document.querySelector('.esp-terminal-content');
    if (!terminal) {
        console.error('Terminal element not found');
        return;
    }

    // If data is an array, process each line
    if (Array.isArray(data)) {
        data.forEach(line => {
            if (line && line.trim()) {
                // Create line element
                const lineElement = document.createElement('div');
                lineElement.className = 'terminal-line';
                lineElement.textContent = line;
                terminal.appendChild(lineElement);

                // Process message if it's in the correct format
                if (line.startsWith('{') && line.endsWith('}')) {
                    const parsedMsg = parseMessage(line);
                    if (parsedMsg) {
                        handleDroneMessage(parsedMsg);
                    }
                }
            }
        });
    } else if (typeof data === 'string') {
        // If data is a string, split it into lines
        const lines = data.split('\n');
        lines.forEach(line => {
            if (line && line.trim()) {
                const lineElement = document.createElement('div');
                lineElement.className = 'terminal-line';
                lineElement.textContent = line;
                terminal.appendChild(lineElement);

                // Process message if it's in the correct format
                if (line.startsWith('{') && line.endsWith('}')) {
                    const parsedMsg = parseMessage(line);
                    if (parsedMsg) {
                        handleDroneMessage(parsedMsg);
                    }
                }
            }
        });
    }

    // Keep only the last 100 lines
    while (terminal.childNodes.length > 100) {
        terminal.removeChild(terminal.firstChild);
    }

    // Scroll to bottom
    terminal.scrollTop = terminal.scrollHeight;
}

// Function to parse message format {S:source,C:command,P:payload}
function parseMessage(message) {
    try {
        // Remove curly braces and split by semicolon
        const cleanMessage = message.replace(/[{}]/g, '');
        const parts = cleanMessage.split(';');
        
        // Create an object from the parts
        const messageObj = {};
        parts.forEach(part => {
            const [key, value] = part.split(':');
            messageObj[key] = value;
        });
        
        return messageObj;
    } catch (error) {
        console.error('Error parsing message:', error);
        return null;
    }
}

// Add drone state management
const droneStates = {
    MCU: {
        isArmed: false,
        mode: 'STABILIZE',
        altitude: 0,
        battery: 0,
        gps: '0 Sats',
        heading: 0,
        distance: '0m',
        isConnected: false,
        lastHeartbeat: Date.now()
    }
};

// Add dynamic drone state initialization
function initializeDroneState(droneId) {
    if (!droneStates[droneId]) {
        droneStates[droneId] = {
            isArmed: false,
            mode: 'STABILIZE',
            altitude: 0,
            battery: 0,
            gps: '0 Sats',
            heading: 0,
            distance: '0m',
            isConnected: false,
            lastHeartbeat: Date.now()
        };
    }
}


function handleDroneMessage(parsedMsg) {
    console.log('Received message:', parsedMsg);
    const { S: source, C: command, P: payload } = parsedMsg;
    
    // Initialize state if this is a new drone
    initializeDroneState(source);
    
    const state = droneStates[source];
    if (!state) return;

    try {
        // Get the full payload
        const fullPayload = parsedMsg.P;
        console.log('Full payload:', fullPayload);

        switch (command) {
            case 'LOC':
                // Parse location data: lat,lon,alt
                const locParts = fullPayload.split(',');
                if (locParts.length >= 3) {
                    const [lat, lon, alt] = locParts.map(Number);
                    console.log('Parsed LOC data:', { lat, lon, alt });
                    state.latitude = lat;
                    state.longitude = lon;
                    state.altitude = Math.abs(alt);
                    updateDroneUI(source);
                }
                break;

            case 'GPS':
                // Parse GPS data: fix_type,num_satellites
                const gpsParts = fullPayload.split(',');
                if (gpsParts.length >= 2) {
                    const [fixType, numSats] = gpsParts.map(Number);
                    console.log('Parsed GPS data:', { fixType, numSats }); // Debug log
                    state.gps = `${fixType}D Fix (${numSats})`;
                    state.gpsFixType = fixType;
                    state.satellites = numSats;
                    updateDroneUI(source);
                }
                break;

            case 'BATT':
                // Parse battery data: voltage,ampere,percentage
                const battParts = fullPayload.split(',');
                if (battParts.length >= 3) {
                    const [voltage, ampere, percentage] = battParts.map(Number);
                    console.log('Parsed BATT data:', { voltage, ampere, percentage }); // Debug log
                    state.voltage = voltage;
                    state.current = ampere;
                    state.battery = Math.round(percentage); // Round to nearest integer
                    updateDroneUI(source);
                }
                break;

            case 'ATTITUDE':
                // Parse attitude data: pitch,roll,yaw,heading
                const attParts = fullPayload.split(',');
                if (attParts.length >= 4) {
                    const [pitch, roll, yaw, heading] = attParts.map(Number);
                    console.log('Parsed ATTITUDE data:', { pitch, roll, yaw, heading }); // Debug log
                    
                    // Convert radians to degrees and store
                    state.pitch = (pitch * 180/Math.PI).toFixed(1);
                    state.roll = (roll * 180/Math.PI).toFixed(1);
                    state.yaw = (yaw * 180/Math.PI).toFixed(1);
                    state.heading = heading;
                    
                    console.log('Updated state:', {
                        pitch: state.pitch,
                        roll: state.roll,
                        yaw: state.yaw,
                        heading: state.heading
                    });
                    updateDroneUI(source);
                }
                break;

            case 'SPEED':
                // Parse speed data: airspeed,groundspeed,[vx,vy,vz]
                const speedParts = fullPayload.split(',');
                if (speedParts.length >= 3) {
                    const airSpeed = parseFloat(speedParts[0]) || 0;
                    const groundSpeed = parseFloat(speedParts[1]) || 0;
                    
                    // Parse velocity vector
                    let velocities = [0, 0, 0];
                    const velocityStr = speedParts.slice(2).join(','); // Join remaining parts
                    if (velocityStr) {
                        try {
                            const cleanVelocity = velocityStr.replace(/[\[\]]/g, '');
                            const velComponents = cleanVelocity.split(/[\s,]+/).filter(v => v !== '');
                            velocities = velComponents.map(v => parseFloat(v) || 0);
                        } catch (e) {
                            console.warn('Error parsing velocity vector:', e);
                        }
                    }
                    
                    state.airSpeed = airSpeed;
                    state.groundSpeed = groundSpeed;
                    state.velocityX = velocities[0];
                    state.velocityY = velocities[1];
                    state.velocityZ = velocities[2];
                    
                    // Calculate total speed
                    const totalSpeed = Math.sqrt(
                        velocities[0]**2 + 
                        velocities[1]**2 + 
                        velocities[2]**2
                    );
                    state.speed = totalSpeed.toFixed(1);
                    updateDroneUI(source);
                }
                break;

            case 'MODE':
                // Update flight mode
                state.mode = payload;
                console.log('Mode updated:', payload);
                updateDroneUI(source);
                break;

            case 'ARMED':
                // Update armed status
                state.isArmed = payload === '1';
                console.log('Armed status updated:', state.isArmed);
                updateDroneUI(source);
                break;

            case 'HB':
                handleDroneHeartbeat(source);
                break;
        }
    } catch (error) {
        console.error(`Error processing ${command} message:`, error);
    }
}

// Update the DroneCard UI with new state
function updateDroneUI(droneId) {
    const drone = droneManager.drones.get(droneId);
    if (!drone) {
        console.warn(`No drone found for ID: ${droneId}`); // Debug log
        return;
    }

    const state = droneStates[droneId];
    if (!state) {
        console.warn(`No state found for drone ID: ${droneId}`); // Debug log
        return;
    }

    console.log(`Updating UI for drone ${droneId} with state:`, state); // Debug log

    // Update the drone card parameters
    const params = {
        heading: state.heading || 0,
        battery: state.battery || 0,
        voltage: state.voltage ? state.voltage.toFixed(1) : '0.0',
        current: state.current ? state.current.toFixed(2) : '0.00',
        altitude: state.altitude ? state.altitude.toFixed(1) : '0.0',
        gps: state.gps || 'No Fix',
        mode: state.mode || 'STABILIZE',
        roll: state.roll || 0,
        pitch: state.pitch || 0,
        yaw: state.yaw || 0,
        airSpeed: state.airSpeed ? state.airSpeed.toFixed(1) : '0.0',
        groundSpeed: state.groundSpeed ? state.groundSpeed.toFixed(1) : '0.0',
        speed: state.speed || '0.0',
        latitude: state.latitude ? state.latitude.toFixed(6) : '0.000000',
        longitude: state.longitude ? state.longitude.toFixed(6) : '0.000000'
    };

    console.log('Sending params to updateParams:', params); // Debug log
    drone.updateParams(params);

    // Update map marker if lat/lon available
    if (state.latitude !== undefined && state.longitude !== undefined) {
        updateDroneMarker(
            droneId, 
            [state.latitude, state.longitude],
            state.heading || 0,
            state.altitude || 0,
            droneId
        );
    }

    // Update Leader_pos with MCU drone's LAT, LON
    if (droneId === 'MCU') {
        const leaderPosElement = document.querySelector('.leader-pos .coordinates');
        if (leaderPosElement) {
            leaderPosElement.textContent = `${params.latitude},${params.longitude}`;
        }
    }
}

// Replace handleMCUHeartbeat with a generic drone heartbeat handler
function handleDroneHeartbeat(droneId) {
    console.log(`${droneId} Heartbeat received`);
    
    // Update heartbeat timestamp
    droneStates[droneId].lastHeartbeat = Date.now();
    droneStates[droneId].isConnected = true;
    
    // Check if drone already exists
    if (!droneManager.drones.has(droneId)) {
        console.log(`Adding new drone card for ${droneId}`);
        // Initialize drone
        droneManager.addDrone(droneId, droneId);
        customAlert.success(`${droneId} connected`);
    } else {
        console.log(`Drone card for ${droneId} already exists`);
    }
}

// Ensure the container exists
const container = document.querySelector('.drone-cards-container');
if (!container) {
    console.error('Drone cards container not found');
} else {
    console.log('Drone cards container found');
}

// Terminal Drag Functionality
function initializeTerminalDrag() {
    const terminal = document.querySelector('.esp-terminal');
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    terminal.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;

        if (e.target === terminal) {
            isDragging = true;
            terminal.classList.add('dragging');
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            xOffset = currentX;
            yOffset = currentY;

            setTranslate(currentX, currentY, terminal);
        }
    }

    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;

        isDragging = false;
        terminal.classList.remove('dragging');
    }

    function setTranslate(xPos, yPos, el) {
        el.style.transform = `translate(${xPos}px, ${yPos}px)`;
    }
}


function setupDroneCardEventListeners(droneId) {
    const armBtn = document.querySelector(`.drone-control-btn.arm-btn[data-drone="${droneId}"]`);
    const launchBtn = document.querySelector(`.drone-control-btn.launch-btn[data-drone="${droneId}"]`);
    const landBtn = document.querySelector(`.drone-control-btn.land-btn[data-drone="${droneId}"]`);
    const modeBtn = document.querySelector(`.drone-control-btn.mode-btn[data-drone="${droneId}"]`);

    if (launchBtn) {
        launchBtn.addEventListener('click', () => {
            const defaultAltitude = '5'; // Default altitude value
            send_command(droneId, 'LAUNCH', defaultAltitude);
            console.log(`LAUNCH command sent for ${droneId} with altitude ${defaultAltitude}`);
        });
    }

    if (armBtn) {
        armBtn.addEventListener('click', () => {
            send_command(droneId, 'ARM', 'GUIDED');
            console.log(`ARM command sent for ${droneId}`);
        });
    }

    if (landBtn) {
        landBtn.addEventListener('click', () => {
            send_command(droneId, 'LAND', '1');
            console.log(`LAND command sent for ${droneId}`);
        });
    }

    if (modeBtn) {
        const modes = ['GUIDED', 'POSHOLD', 'LOITER', 'STABILIZE', 'RTL', 'LAND', 'SMART_RTL', 'FLIP', 'ALT_HOLD'];
        let currentModeIndex = 0;

        // Set initial mode text
        modeBtn.textContent = modes[currentModeIndex];

        // Create a new button with fresh event listeners
        const updatedModeBtn = modeBtn.cloneNode(true);
        modeBtn.parentNode.replaceChild(updatedModeBtn, modeBtn);

        // Handle mouse wheel event - only change the displayed mode
        updatedModeBtn.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY < 0) {
                // Scroll up - go to previous mode
                currentModeIndex = (currentModeIndex - 1 + modes.length) % modes.length;
            } else {
                // Scroll down - go to next mode
                currentModeIndex = (currentModeIndex + 1) % modes.length;
            }
            updatedModeBtn.textContent = modes[currentModeIndex];
        }, { passive: false });

        // Handle click event - send the command for the currently displayed mode
        updatedModeBtn.addEventListener('click', () => {
            const selectedMode = modes[currentModeIndex];
            send_command(droneId, 'SET_MODE', selectedMode);
            console.log(`Mode set to ${selectedMode} for ${droneId}`);
        });
    }
}

// Add keyboard control functionality
function initializeKeyboardControls() {
    document.addEventListener('keydown', (event) => {
        // Only process keyboard input if mission planner is active
        const missionPlanner = document.querySelector('.mission-planner-popup');
        if (!missionPlanner || missionPlanner.style.display === 'none') return;

        // Get selected drone
        const selectedDroneElement = document.querySelector('.drone-item.selected');
        if (!selectedDroneElement) {
            console.log('No drone selected');
            return;
        }

        const droneId = selectedDroneElement.dataset.droneId;
        const frames = window.missionPlanner.keyframes.get(droneId);
        if (!frames || !frames[window.missionPlanner.currentKeyframe]) return;

        const currentFrame = frames[window.missionPlanner.currentKeyframe];
        let positionChanged = false;

        // Clone current position
        const newPosition = { ...currentFrame.position };

        switch(event.key.toLowerCase()) {
            // X-axis controls (A/D)
            case 'a':
                newPosition.x += 1;
                positionChanged = true;
                break;
            case 'd':
                newPosition.x -= 1;
                positionChanged = true;
                break;

            // Y-axis controls (W/S)
            case 'w':
                newPosition.y -= 1;
                positionChanged = true;
                break;
            case 's':
                newPosition.y += 1;
                positionChanged = true;
                break;

            // Z-axis controls (Q/E)
            case 'q':
                newPosition.z += 1;
                positionChanged = true;
                break;
            case 'e':
                newPosition.z -= 1;
                positionChanged = true;
                break;
        }

        if (positionChanged) {
            // Update position
            currentFrame.position = newPosition;

            // Update UI
            window.missionPlanner.updateViews();
            window.missionPlanner.updateWaypointInputs(currentFrame);

            // Show movement notification
            customAlert.show(`Moved ${droneId} to X: ${newPosition.x.toFixed(1)}, Y: ${newPosition.y.toFixed(1)}, Z: ${newPosition.z.toFixed(1)}`, 'info', 1000);
        }
    });
}

class Logbook {
    constructor() {
        this.popup = document.querySelector('.logbook-popup');
        this.logFilesList = document.querySelector('.log-files-list');
        this.logViewer = document.querySelector('.log-viewer');
        this.closeButton = document.getElementById('close-logbook');
        this.currentLogFile = null;
        this.refreshInterval = null;
        
        this.initialize();
    }
    
    initialize() {
        if (!this.popup || !this.logFilesList || !this.logViewer || !this.closeButton) {
            console.error('Required logbook elements not found');
            return false;
        }
        
        // Setup event listeners
        this.closeButton.addEventListener('click', () => this.hide());
        
        // Close on click outside
        this.popup.addEventListener('click', (e) => {
            if (e.target === this.popup) {
                this.hide();
            }
        });
        
        return true;
    }
    
    show() {
        if (!this.popup) return;
        
        this.popup.style.display = 'flex';
        setTimeout(() => {
            this.popup.classList.add('active');
            this.loadLogFiles();
            
            // Start auto-refresh if viewing current log
            if (this.currentLogFile && this.currentLogFile.endsWith(new Date().toISOString().split('T')[0] + '.txt')) {
                this.startAutoRefresh();
            }
        }, 10);
    }
    
    hide() {
        if (!this.popup) return;
        
        this.popup.classList.remove('active');
        setTimeout(() => {
            this.popup.style.display = 'none';
            this.stopAutoRefresh();
        }, 300);
    }
    
    async loadLogFiles() {
        try {
            const response = await fetch('http://127.0.0.1:5000/list_logs');
            if (!response.ok) throw new Error('Failed to fetch log files');
            
            const files = await response.json();
            this.renderLogFiles(files);
        } catch (error) {
            console.error('Error loading log files:', error);
            customAlert.error('Failed to load log files');
        }
    }
    
    renderLogFiles(files) {
        if (!this.logFilesList) return;
        
        this.logFilesList.innerHTML = '';
        files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'log-file-item';
            if (file.name === this.currentLogFile) {
                fileItem.classList.add('active');
            }
            
            fileItem.innerHTML = `
                <div class="log-file-name">${file.name}</div>
                <div class="log-file-date">${file.date}</div>
            `;
            
            fileItem.addEventListener('click', () => this.loadLogContent(file.name));
            this.logFilesList.appendChild(fileItem);
        });
    }
    
    async loadLogContent(fileName) {
        try {
            // Stop auto-refresh when switching files
            this.stopAutoRefresh();
            
            const response = await fetch(`http://127.0.0.1:5000/get_log/${fileName}`);
            if (!response.ok) throw new Error('Failed to fetch log content');
            
            const content = await response.text();
            this.logViewer.textContent = content;
            this.logViewer.scrollTop = this.logViewer.scrollHeight;
            
            // Update active state
            this.currentLogFile = fileName;
            document.querySelectorAll('.log-file-item').forEach(item => {
                item.classList.toggle('active', item.querySelector('.log-file-name').textContent === fileName);
            });
            
            // Start auto-refresh if viewing today's log
            if (fileName.endsWith(new Date().toISOString().split('T')[0] + '.txt')) {
                this.startAutoRefresh();
            }
        } catch (error) {
            console.error('Error loading log content:', error);
            customAlert.error('Failed to load log content');
        }
    }
    
    startAutoRefresh() {
        if (this.refreshInterval) return;
        
        this.refreshInterval = setInterval(() => {
            if (this.currentLogFile) {
                this.loadLogContent(this.currentLogFile);
            }
        }, 5000); // Refresh every 5 seconds
    }
    
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
}

// Initialize logbook when menu item is clicked
document.getElementById('menu-logbook').addEventListener('click', () => {
    if (!window.logbook) {
        window.logbook = new Logbook();
    }
    window.logbook.show();
});

// Update showLogbook function
function showLogbook() {
    if (!window.logbook) {
        window.logbook = new Logbook();
    }
    window.logbook.show();
}

class SetupMenu {
    constructor() {
        this.popup = document.querySelector('.setup-popup');
        this.setupList = document.querySelector('.drone-setup-list');
        this.closeButton = document.getElementById('close-setup');
        this.ipPortDialog = document.querySelector('.ip-port-dialog');
        this.defaultDrones = ['MCU', 'CD1', 'CD2', 'CD3', 'CD4','CD5'];
        this.currentDrone = null;
        
        this.initialize();
    }
    
    initialize() {
        if (!this.popup || !this.setupList || !this.closeButton || !this.ipPortDialog) {
            console.error('Required setup menu elements not found');
            return false;
        }
        
        // Setup event listeners
        this.closeButton.addEventListener('click', () => this.hide());
        
        // Close on click outside
        this.popup.addEventListener('click', (e) => {
            if (e.target === this.popup) {
                this.hide();
            }
        });
        
        // Setup IP/Port dialog event listeners
        document.getElementById('close-dialog').addEventListener('click', () => this.hideIpPortDialog());
        document.querySelector('.cancel-btn').addEventListener('click', () => this.hideIpPortDialog());
        document.querySelector('.confirm-btn').addEventListener('click', () => this.handleIpPortConfirm());
        
        return true;
    }
    
    show() {
        if (!this.popup) return;
        
        this.popup.style.display = 'flex';
        setTimeout(() => {
            this.popup.classList.add('active');
            this.renderDroneList();
        }, 10);
    }
    
    hide() {
        if (!this.popup) return;
        
        this.popup.classList.remove('active');
        setTimeout(() => {
            this.popup.style.display = 'none';
        }, 300);
    }
    
    renderDroneList() {
        if (!this.setupList) return;
        
        this.setupList.innerHTML = '';
        this.defaultDrones.forEach(droneId => {
            const droneItem = document.createElement('div');
            droneItem.className = 'drone-setup-item';
            droneItem.innerHTML = `
                <div class="drone-setup-info">
                    <span class="drone-id">${droneId}</span>
                </div>
                <div class="drone-setup-buttons">
                    <button class="setup-btn" data-drone="${droneId}">Setup</button>
                    <button class="reconnect-btn" data-drone="${droneId}">Reconnect</button>
                </div>
            `;
            
            // Add event listeners for buttons
            const setupBtn = droneItem.querySelector('.setup-btn');
            const reconnectBtn = droneItem.querySelector('.reconnect-btn');
            
            setupBtn.addEventListener('click', () => this.handleSetup(droneId));
            reconnectBtn.addEventListener('click', () => this.handleReconnect(droneId));
            
            this.setupList.appendChild(droneItem);
        });
    }
    
    handleSetup(droneId) {
        this.currentDrone = droneId;
        this.showIpPortDialog();
    }
    
    handleReconnect(droneId) {
        send_command(droneId, 'INIT', '0');
        customAlert.success(`Reconnect command sent to ${droneId}`);
    }
    
    showIpPortDialog() {
        if (!this.ipPortDialog) return;
        
        // Clear previous inputs
        document.getElementById('ip-input').value = '';
        const portInput = document.getElementById('port-input');
        portInput.value = '';
        
        // Set port input to accept only numbers
        portInput.type = 'number';
        portInput.min = '1';
        portInput.max = '65535';
        
        this.ipPortDialog.style.display = 'flex';
        setTimeout(() => {
            this.ipPortDialog.classList.add('active');
        }, 10);
    }
    
    hideIpPortDialog() {
        if (!this.ipPortDialog) return;
        
        this.ipPortDialog.classList.remove('active');
        setTimeout(() => {
            this.ipPortDialog.style.display = 'none';
        }, 300);
    }
    
    handleIpPortConfirm() {
        if (!this.currentDrone) return;
        
        const ip = document.getElementById('ip-input').value.trim();
        const port = parseInt(document.getElementById('port-input').value.trim());
        
        // Validate port number
        if (port && (isNaN(port) || port < 1 || port > 65535)) {
            customAlert.error('Port must be a number between 1 and 65535');
            return;
        }
        
        // If both fields are empty, send '0' as payload
        const payload = (ip === '' && !port) ? '0' : `${ip},${port}`;
        
        send_command(this.currentDrone, 'SOCAT', payload);
        customAlert.success(`Setup command sent to ${this.currentDrone}`);
        
        this.hideIpPortDialog();
    }
}

// Initialize setup menu when menu item is clicked
document.getElementById('menu-drone-settings').addEventListener('click', () => {
    if (!window.setupMenu) {
        window.setupMenu = new SetupMenu();
    }
    window.setupMenu.show();
});

// Update showDroneSettings function
function showDroneSettings() {
    if (!window.setupMenu) {
        window.setupMenu = new SetupMenu();
    }
    window.setupMenu.show();
}

class SettingsMenu {
    constructor() {
        this.popup = document.querySelector('.settings-popup');
        this.closeButton = document.getElementById('close-settings');
        this.saveButton = document.querySelector('.save-settings');
        this.resetButton = document.querySelector('.reset-settings');
        
        // Default settings
        this.defaultSettings = {
            map: {
                defaultType: 'light',
                defaultZoom: 18
            },
            mission: {
                defaultAltitude: 2,
                defaultSeparation: 2,
                keyframeDelay: 1000
            },
            display: {
                showDroneLabels: true,
                showAltitude: true,
                showHeading: true,
                showPath: true
            },
            safety: {
                minBattery: 20,
                maxAltitude: 100,
                maxDistance: 500,
                returnAltitude: 10
            },
            communication: {
                telemetryRate: 500,
                heartbeatTimeout: 3
            }
        };
        
        this.currentSettings = this.loadSettings();
        this.initialize();
    }
    
    initialize() {
        if (!this.popup || !this.closeButton || !this.saveButton || !this.resetButton) {
            console.error('Required settings elements not found');
            return false;
        }
        
        // Setup event listeners
        this.closeButton.addEventListener('click', () => this.hide());
        this.saveButton.addEventListener('click', () => this.saveSettings());
        this.resetButton.addEventListener('click', () => this.resetSettings());
        
        // Close on click outside
        this.popup.addEventListener('click', (e) => {
            if (e.target === this.popup) {
                this.hide();
            }
        });
        
        return true;
    }
    
    show() {
        if (!this.popup) return;
        
        this.popup.style.display = 'flex';
        setTimeout(() => {
            this.popup.classList.add('active');
            this.loadSettingsToUI();
        }, 10);
    }
    
    hide() {
        if (!this.popup) return;
        
        this.popup.classList.remove('active');
        setTimeout(() => {
            this.popup.style.display = 'none';
        }, 300);
    }
    
    loadSettings() {
        const savedSettings = localStorage.getItem('appSettings');
        return savedSettings ? JSON.parse(savedSettings) : this.defaultSettings;
    }
    
    loadSettingsToUI() {
        // Map Settings
        document.getElementById('default-map-type').value = this.currentSettings.map.defaultType;
        document.getElementById('default-zoom').value = this.currentSettings.map.defaultZoom;
        
        // Mission Settings
        document.getElementById('default-altitude').value = this.currentSettings.mission.defaultAltitude;
        document.getElementById('default-separation').value = this.currentSettings.mission.defaultSeparation;
        document.getElementById('keyframe-delay').value = this.currentSettings.mission.keyframeDelay;
        
        // Display Settings
        document.getElementById('show-drone-labels').checked = this.currentSettings.display.showDroneLabels;
        document.getElementById('show-altitude').checked = this.currentSettings.display.showAltitude;
        document.getElementById('show-heading').checked = this.currentSettings.display.showHeading;
        document.getElementById('show-path').checked = this.currentSettings.display.showPath;
        
        // Safety Settings
        document.getElementById('min-battery').value = this.currentSettings.safety.minBattery;
        document.getElementById('max-altitude').value = this.currentSettings.safety.maxAltitude;
        document.getElementById('max-distance').value = this.currentSettings.safety.maxDistance;
        document.getElementById('return-altitude').value = this.currentSettings.safety.returnAltitude;
        
        // Communication Settings
        document.getElementById('telemetry-rate').value = this.currentSettings.communication.telemetryRate;
        document.getElementById('heartbeat-timeout').value = this.currentSettings.communication.heartbeatTimeout;
    }
    
    getSettingsFromUI() {
        return {
            map: {
                defaultType: document.getElementById('default-map-type').value,
                defaultZoom: parseInt(document.getElementById('default-zoom').value)
            },
            mission: {
                defaultAltitude: parseFloat(document.getElementById('default-altitude').value),
                defaultSeparation: parseFloat(document.getElementById('default-separation').value),
                keyframeDelay: parseInt(document.getElementById('keyframe-delay').value)
            },
            display: {
                showDroneLabels: document.getElementById('show-drone-labels').checked,
                showAltitude: document.getElementById('show-altitude').checked,
                showHeading: document.getElementById('show-heading').checked,
                showPath: document.getElementById('show-path').checked
            },
            safety: {
                minBattery: parseInt(document.getElementById('min-battery').value),
                maxAltitude: parseInt(document.getElementById('max-altitude').value),
                maxDistance: parseInt(document.getElementById('max-distance').value),
                returnAltitude: parseInt(document.getElementById('return-altitude').value)
            },
            communication: {
                telemetryRate: parseInt(document.getElementById('telemetry-rate').value),
                heartbeatTimeout: parseInt(document.getElementById('heartbeat-timeout').value)
            }
        };
    }
    
    saveSettings() {
        const newSettings = this.getSettingsFromUI();
        localStorage.setItem('appSettings', JSON.stringify(newSettings));
        this.currentSettings = newSettings;
        
        // Apply settings to the application
        this.applySettings();
        
        customAlert.success('Settings saved successfully');
        this.hide();
    }
    
    resetSettings() {
        if (confirm('Are you sure you want to reset all settings to default?')) {
            localStorage.removeItem('appSettings');
            this.currentSettings = this.defaultSettings;
            this.loadSettingsToUI();
            
            // Apply default settings to the application
            this.applySettings();
            
            customAlert.success('Settings reset to default');
        }
    }
    
    applySettings() {
        // Apply Map Settings
        if (map) {
            map.setZoom(this.currentSettings.map.defaultZoom);
            // Switch map type based on setting
            const layers = {
                light: document.querySelector('.light-mode'),
                satellite: document.querySelector('.satellite-mode')
            };
            const selectedLayer = layers[this.currentSettings.map.defaultType];
            if (selectedLayer) {
                selectedLayer.click();
            }
        }
        
        // Apply Mission Settings
        document.querySelector('.measurement input').value = this.currentSettings.mission.defaultSeparation;
        document.querySelector('.measurement-12 input').value = this.currentSettings.mission.defaultAltitude;
        
        // Apply Display Settings
        const droneMarkers = document.querySelectorAll('.drone-marker-container');
        droneMarkers.forEach(marker => {
            const label = marker.querySelector('.drone-name');
            const altitude = marker.querySelector('.drone-altitude');
            const heading = marker.querySelector('.drone-heading-indicator');
            
            if (label) label.style.display = this.currentSettings.display.showDroneLabels ? 'block' : 'none';
            if (altitude) altitude.style.display = this.currentSettings.display.showAltitude ? 'block' : 'none';
            if (heading) heading.style.display = this.currentSettings.display.showHeading ? 'block' : 'none';
        });
        
        // Apply path visibility
        const missionPaths = document.querySelectorAll('.mission-path');
        missionPaths.forEach(path => {
            path.style.display = this.currentSettings.display.showPath ? 'block' : 'none';
        });
        
        // Apply Communication Settings
        clearInterval(window.telemetryInterval);
        window.telemetryInterval = setInterval(fetchSerialData, this.currentSettings.communication.telemetryRate);
    }
}

// Initialize settings menu when menu item is clicked
document.getElementById('menu-settings').addEventListener('click', () => {
    if (!window.settingsMenu) {
        window.settingsMenu = new SettingsMenu();
    }
    window.settingsMenu.show();
});

// Update showSettings function
function showSettings() {
    if (!window.settingsMenu) {
        window.settingsMenu = new SettingsMenu();
    }
    window.settingsMenu.show();
}

class HelpCenter {
    constructor() {
        this.popup = document.querySelector('.help-popup');
        this.closeButton = document.getElementById('close-help');
        this.navItems = document.querySelectorAll('.help-nav-item');
        this.sections = document.querySelectorAll('.help-section');
        
        this.initialize();
    }
    
    initialize() {
        if (!this.popup || !this.closeButton) {
            console.error('Required help center elements not found');
            return false;
        }
        
        // Setup event listeners
        this.closeButton.addEventListener('click', () => this.hide());
        
        // Close on click outside
        this.popup.addEventListener('click', (e) => {
            if (e.target === this.popup) {
                this.hide();
            }
        });
        
        // Setup navigation
        this.navItems.forEach(item => {
            item.addEventListener('click', () => {
                const section = item.dataset.section;
                this.showSection(section);
            });
        });
        
        return true;
    }
    
    show() {
        if (!this.popup) return;
        
        this.popup.style.display = 'flex';
        setTimeout(() => {
            this.popup.classList.add('active');
        }, 10);
    }
    
    hide() {
        if (!this.popup) return;
        
        this.popup.classList.remove('active');
        setTimeout(() => {
            this.popup.style.display = 'none';
        }, 300);
    }
    
    showSection(sectionId) {
        // Remove active class from all nav items and sections
        this.navItems.forEach(item => item.classList.remove('active'));
        this.sections.forEach(section => section.classList.remove('active'));
        
        // Add active class to selected nav item and section
        const selectedNav = document.querySelector(`.help-nav-item[data-section="${sectionId}"]`);
        const selectedSection = document.getElementById(sectionId);
        
        if (selectedNav && selectedSection) {
            selectedNav.classList.add('active');
            selectedSection.classList.add('active');
        }
    }
}

// Initialize help center when menu item is clicked
document.getElementById('menu-help').addEventListener('click', () => {
    if (!window.helpCenter) {
        window.helpCenter = new HelpCenter();
    }
    window.helpCenter.show();
});

// Update showHelp function
function showHelp() {
    if (!window.helpCenter) {
        window.helpCenter = new HelpCenter();
    }
    window.helpCenter.show();
}

// Add NED Control class
class NEDControl {
    constructor() {
        this.isEnabled = false;
        this.activeTargets = new Set();
        this.velocities = { x: 0, y: 0, z: 0, yaw: 0 };
        this.keyStates = {
            'w': false, // Forward (+x)
            's': false, // Backward (-x)
            'a': false, // Left (+y)
            'd': false, // Right (-y)
            'q': false, // Up (-z)
            'e': false, // Down (+z)
            'z': false, // Yaw left
            'c': false,  // Yaw right
            'b': false  // Servo toggle
        };
        this.isServoOpen = false;
        
        // Map number keys to drone IDs
        this.droneKeys = {
            '0': 'MCU',
            '1': 'CD1',
            '2': 'CD2',
            '3': 'CD3',
            '4': 'CD4',
            '5': 'CD5'
        };
        
        this.commandInterval = null;
        this.initialize();
    }
    
    initialize() {
        // Initialize main toggle
        const mainToggle = document.querySelector('.main-control-toggle');
        mainToggle?.addEventListener('click', () => this.toggleMainControl());
        
        // Initialize drone toggles
        const droneToggles = document.querySelectorAll('.drone-toggle');
        droneToggles.forEach(toggle => {
            toggle.addEventListener('click', () => {
                const droneId = toggle.dataset.drone;
                this.toggleDroneControl(droneId);
            });
        });
        
        // Initialize keyboard listeners
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));

        // Initialize servo toggle
        const servoToggle = document.querySelector('.servo-toggle');
        servoToggle?.addEventListener('click', () => this.toggleServo());
    }
    
    toggleMainControl() {
        const mainToggle = document.querySelector('.main-control-toggle');
        this.isEnabled = !this.isEnabled;
        
        if (this.isEnabled) {
            mainToggle.textContent = 'NED Control: ON';
            mainToggle.classList.add('active');
            this.startCommandInterval();
        } else {
            mainToggle.textContent = 'NED Control: OFF';
            mainToggle.classList.remove('active');
            this.resetVelocities();
            this.stopCommandInterval();
            // Reset servo state when disabling NED control
            this.isServoOpen = false;
            const servoToggle = document.querySelector('.servo-toggle');
            if (servoToggle) {
                servoToggle.textContent = 'SERVO: CLOSED';
                servoToggle.classList.remove('active');
            }
            this.activeTargets.forEach(target => {
                send_command(target, 'NED', '0,0,0,0');
                send_command(target, 'SERVO', 'CLOSE');
            });
        }
    }
    
    toggleDroneControl(droneId) {
        const button = document.querySelector(`.drone-toggle[data-drone="${droneId}"]`);
        if (!button) return;

        if (this.activeTargets.has(droneId)) {
            this.activeTargets.delete(droneId);
            button.textContent = `${droneId}: OFF`;
            button.classList.remove('active');
            // Send zero velocity when disabling control
            send_command(droneId, 'NED', '0,0,0,0');
        } else {
            this.activeTargets.add(droneId);
            button.textContent = `${droneId}: ON`;
            button.classList.add('active');
        }
    }
    
    handleKeyDown(e) {
        if (!this.isEnabled) return;
        
        const key = e.key.toLowerCase();
        
        // Special handling for servo toggle
        if (key === 'b') {
            e.preventDefault();
            this.toggleServo();
            return;
        }

        // Handle number keys for drone toggling
        if (this.droneKeys[e.key]) {
            e.preventDefault();
            this.toggleDroneControl(this.droneKeys[e.key]);
            return;
        }
        
        // Handle movement keys
        if (this.keyStates.hasOwnProperty(key) && !this.keyStates[key]) {
            e.preventDefault();
            this.keyStates[key] = true;
            this.updateVelocities();
            this.sendVelocityCommands(); // Send initial command immediately
        }
    }
    
    handleKeyUp(e) {
        if (!this.isEnabled) return;
        
        const key = e.key.toLowerCase();
        // Don't process 'b' key in keyup since it's handled in keydown
        if (key === 'b') return;
        
        if (this.keyStates.hasOwnProperty(key)) {
            e.preventDefault();
            this.keyStates[key] = false;
            this.updateVelocities();
            this.sendVelocityCommands();
        }
    }
    
    updateVelocities() {
        // Reset velocities
        this.velocities = { x: 0, y: 0, z: 0, yaw: 0 };
        
        // Forward/Backward (X-axis)
        if (this.keyStates['w']) this.velocities.x = 0.8;
        if (this.keyStates['s']) this.velocities.x = -0.8;
        
        // Left/Right (Y-axis)
        if (this.keyStates['a']) this.velocities.y = 0.8;
        if (this.keyStates['d']) this.velocities.y = -0.8;
        
        // Up/Down (Z-axis)
        if (this.keyStates['q']) this.velocities.z = -0.8;
        if (this.keyStates['e']) this.velocities.z = 0.8;
        
        // Yaw control (raw degrees)
        if (this.keyStates['z']) this.velocities.yaw = -10;
        if (this.keyStates['c']) this.velocities.yaw = 10;
    }
    
    resetVelocities() {
        this.velocities = { x: 0, y: 0, z: 0, yaw: 0 };
        Object.keys(this.keyStates).forEach(key => {
            this.keyStates[key] = false;
        });
    }
    
    sendVelocityCommands() {
        if (!this.isEnabled || this.activeTargets.size === 0) return;
        
        this.activeTargets.forEach(target => {
            const command = `${this.velocities.x},${this.velocities.y},${this.velocities.z},${this.velocities.yaw}`;
            send_command(target, 'NED', command);
        });
    }

    startCommandInterval() {
        if (!this.commandInterval) {
            this.commandInterval = setInterval(() => {
                this.sendVelocityCommands();
            }, 800);
        }
    }

    stopCommandInterval() {
        if (this.commandInterval) {
            clearInterval(this.commandInterval);
            this.commandInterval = null;
        }
    }

    toggleServo() {
        if (!this.isEnabled) {
            customAlert.error('Enable NED control first');
            return;
        }

        this.isServoOpen = !this.isServoOpen;
        const servoToggle = document.querySelector('.servo-toggle');
        
        if (servoToggle) {
            servoToggle.textContent = `SERVO: ${this.isServoOpen ? 'OPEN' : 'CLOSED'}`;
            servoToggle.classList.toggle('active', this.isServoOpen);
        }

        // Send servo command specifically to CD5
        send_command('CD5', 'SERVO', this.isServoOpen ? 'OPEN' : 'CLOSE');
    }
}

// Initialize NED Control when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.nedControl = new NEDControl();
});

class MissionDecoder {
    constructor() {
        this.frames = [];
        this.frameDelays = [];
        this.currentFrame = 0;
        this.isPaused = false;
    }

    // Utility function to calculate displacement and angle from x,y coordinates
    calculateDisplacementAndAngle(dx, dy) {
        // Calculate displacement (distance)
        const displacement = Math.sqrt(dx * dx + dy * dy);
        
        // Calculate angle in radians (-π to π)
        let angle = Math.atan2(dy, dx);
        
        // Convert to degrees and normalize to 0-360
        angle = ((angle * 180 / Math.PI) + 360) % 360;
        
        return { displacement, angle };
    }

    async load_mission(missionData) {
        try {
            // Reset arrays
            this.frames = [];
            this.frameDelays = [];
            this.currentFrame = 0;

            // Store frame delays
            this.frameDelays = [...missionData.frameDelays];

            // Get maximum number of frames
            const maxFrames = Math.max(...Object.values(missionData.drones).map(drone => drone.frames.length));
            
            // Process each frame
            for (let frameIndex = 0; frameIndex < maxFrames; frameIndex++) {
                const frameCommands = [];

                // Process each drone's position for this frame
                Object.entries(missionData.drones).forEach(([droneId, droneData]) => {
                    if (frameIndex < droneData.frames.length) {
                        const frame = droneData.frames[frameIndex];
                        
                        // Calculate displacement from dx and dy
                        const displacement = Math.sqrt(frame.dx * frame.dx + frame.dy * frame.dy);

                        // Create MTL command with displacement, z, and heading
                        frameCommands.push({
                            target: droneId,
                            command: 'MTL',
                            payload: `${displacement.toFixed(2)},${frame.position.z.toFixed(2)},${frame.heading.toFixed(1)}`
                        });
                    }
                });

                // Add custom commands for this frame if they exist
                if (missionData.customCommands) {
                    const customCmds = missionData.customCommands.find(([frameIdx]) => frameIdx === frameIndex);
                    if (customCmds) {
                        customCmds[1].forEach(cmd => {
                            frameCommands.push({
                                target: cmd.droneId,
                                command: cmd.command,
                                payload: cmd.payload
                            });
                        });
                    }
                }

                // Add frame data to frames array with corresponding delay
                this.frames.push({
                    commands: frameCommands,
                    delay: this.frameDelays[frameIndex] || 1000
                });
            }

            return true;
        } catch (error) {
            console.error('Error loading mission:', error);
            return false;
        }
    }

    get_next_frame_commands() {
        if (this.isPaused || this.currentFrame >= this.frames.length) {
            return null;
        }

        const frameData = this.frames[this.currentFrame];
        this.currentFrame++;

        // Return both commands and the correct delay
        return {
            commands: frameData.commands,
            delay: frameData.delay
        };
    }

    stop_mission() {
        const landCommands = [];
        // Generate LAND commands for all unique drone targets
        const seenDrones = new Set();
        this.frames.forEach(frame => {
            frame.commands.forEach(cmd => {
                if (!seenDrones.has(cmd.target)) {
                    seenDrones.add(cmd.target);
                    landCommands.push({
                        target: cmd.target,
                        command: 'SET_MODE',
                        payload: 'GUIDED'
                    });
                }
            });
        });
        this.currentFrame = 0;
        return landCommands;
    }

    pause_mission() {
        this.isPaused = true;
    }

    resume_mission() {
        this.isPaused = false;
    }
}

// Initialize event listeners for LED effects
const rainbowBtn = document.getElementById('rainbow-effect');
const chaseBtn = document.getElementById('chase-effect');
const flashBtn = document.getElementById('flash-effect');
const customCommandSelect = document.getElementById('custom-command');
const lightColorPicker = document.getElementById('light-color-picker');
const addCommandBtn = document.getElementById('add-command');

customCommandSelect.addEventListener('change', (e) => {
    if (e.target.value === 'LIGHT') {
        lightColorPicker.style.display = 'block';
    } else {
        lightColorPicker.style.display = 'none';
    }
});

rainbowBtn.addEventListener('click', () => {
    const selectedDrone = document.querySelector('.drone-item.selected');
    if (selectedDrone) {
        const droneId = selectedDrone.dataset.droneId;
        // Set command to LIGHT
        customCommandSelect.value = 'LIGHT';
        lightColorPicker.style.display = 'block';
        
        // Create and dispatch a click event on add command button
        const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
        });
        
        // Override the color picker value temporarily
        const colorPicker = document.getElementById('light-color');
        const originalColor = colorPicker.value;
        colorPicker.value = '#rnbw';
        
        // Simulate click
        addCommandBtn.dispatchEvent(clickEvent);
        
        // Restore original color
        colorPicker.value = originalColor;
    }
});

chaseBtn.addEventListener('click', () => {
    const selectedDrone = document.querySelector('.drone-item.selected');
    if (selectedDrone) {
        const droneId = selectedDrone.dataset.droneId;
        // Set command to LIGHT
        customCommandSelect.value = 'LIGHT';
        lightColorPicker.style.display = 'block';
        
        // Create and dispatch a click event on add command button
        const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
        });
        
        // Override the color picker value temporarily
        const colorPicker = document.getElementById('light-color');
        const originalColor = colorPicker.value;
        colorPicker.value = '#chase';
        
        // Simulate click
        addCommandBtn.dispatchEvent(clickEvent);
        
        // Restore original color
        colorPicker.value = originalColor;
    }
});

flashBtn.addEventListener('click', () => {
    const selectedDrone = document.querySelector('.drone-item.selected');
    if (selectedDrone) {
        const droneId = selectedDrone.dataset.droneId;
        // Set command to LIGHT
        customCommandSelect.value = 'LIGHT';
        lightColorPicker.style.display = 'block';
        
        // Create and dispatch a click event on add command button
        const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
        });
        
        // Override the color picker value temporarily
        const colorPicker = document.getElementById('light-color');
        const originalColor = colorPicker.value;
        colorPicker.value = '#flash';
        
        // Simulate click
        addCommandBtn.dispatchEvent(clickEvent);
        
        // Restore original color
        colorPicker.value = originalColor;
    }
});


// Update add command button handler to handle color picker value
addCommandBtn.addEventListener('click', () => {
    const selectedDrone = document.querySelector('.drone-item.selected');
    const command = customCommandSelect.value;
    
    if (selectedDrone && command) {
        const droneId = selectedDrone.dataset.droneId;
        let payload = '1'; // default payload
        
        if (command === 'LIGHT') {
            const colorPicker = document.getElementById('light-color');
            // Remove the # from hex color and convert to lowercase
            payload = colorPicker.value.substring(1).toLowerCase();
        }
        
        addCustomCommand(currentKeyframe, droneId, command, payload);
        updateCommandList();
    }
});

// Add CSS styles for better command visibility
const style = document.createElement('style');
style.textContent = `
    .command-item {
        background: rgba(26, 38, 52, 0.9);
        padding: 8px 12px;
        margin: 4px 0;
        border-radius: 4px;
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 12px;
        align-items: center;
    }

    .command-item .target {
        color: #4a90e2;
        font-weight: 500;
        min-width: 60px;
    }

    .command-item .command {
        color: #95bdf8;
    }

    .command-item .payload {
        color: #70c172;
        font-family: monospace;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .color-preview {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.2);
    }

    .mission-viewer {
        z-index: 1000;
    }
`;
document.head.appendChild(style);

// Add these styles to the existing style element
const additionalStyles = `
    .pos-coord {
        display: inline-block;
        padding: 2px 6px;
        margin-right: 4px;
        background: rgba(74, 144, 226, 0.2);
        border-radius: 3px;
        color: #95bdf8;
    }

    .pos-heading {
        display: inline-block;
        padding: 2px 6px;
        background: rgba(112, 193, 114, 0.2);
        border-radius: 3px;
        color: #70c172;
    }

    .command-item .payload {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        align-items: center;
    }
`;

// Update the existing style element's content
style.textContent += additionalStyles;

// Add MTL menu item after missions
function addMTLMenuItem() {
    const sidebarMenu = document.querySelector('.sidebar-menu');
    const missionsButton = document.getElementById('menu-missions');
    
    // Create MTL menu item
    const mtlButton = document.createElement('button');
    mtlButton.className = 'menu-item';
    mtlButton.id = 'menu-mtl';
    mtlButton.innerHTML = `
        <div class="menu-icon">
            <img src="./assets/images/missions-icon.png" alt="MTL" />
        </div>
        <span class="menu-text">MTL</span>
    `;
    
    // Insert MTL button after missions button
    missionsButton.parentNode.insertBefore(mtlButton, missionsButton.nextSibling);
    
    // Add click handler
    mtlButton.addEventListener('click', () => {
        // Remove active class from all menu items
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Add active class to MTL button
        mtlButton.classList.add('active');
        
        // Show MTL interface
        showMTL();
    });
}

// Initialize MTL menu when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    addMTLMenuItem();
});

// Add these utility functions
function calculateDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

function calculateBearing(x1, y1, x2, y2) {
    const deltaX = x2 - x1;
    const deltaY = y2 - y1;
    let bearing = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
    
    // Convert to 0-360 range
    bearing = ((bearing % 360) + 360) % 360;
    return bearing;
}

function getQuadrant(bearing) {
    if (bearing >= 0 && bearing < 90) return 1;
    if (bearing >= 90 && bearing < 180) return 2;
    if (bearing >= 180 && bearing < 270) return 3;
    return 4;
}

// Add a function to load missions from folder
async function loadMissionsFromFolder() {
    try {
        const response = await fetch('http://127.0.0.1:5000/list_missions');
        if (!response.ok) {
            throw new Error(`Failed to fetch missions: ${response.statusText}`);
        }
        const missions = await response.json();
        
        // Process missions to ensure they have dx and dy
        const processedMissions = missions.map(mission => {
            if (mission.drones) {
                Object.values(mission.drones).forEach(drone => {
                    drone.frames = drone.frames.map((frame, index, frames) => {
                        if (frame.dx === undefined || frame.dy === undefined) {
                            // Calculate dx and dy if not present
                            if (index > 0) {
                                frame.dx = frame.position.x - frames[index - 1].position.x;
                                frame.dy = frame.position.y - frames[index - 1].position.y;
                            } else {
                                frame.dx = frame.position.x;
                                frame.dy = frame.position.y;
                            }
                        }
                        return frame;
                    });
                });
            }
            return mission;
        });

        updateMissionDropdown(processedMissions);
    } catch (error) {
        console.error('Error loading missions:', error);
        customAlert.error('Failed to load missions: ' + error.message);
    }
}

// Function to update the mission dropdown
function updateMissionDropdown(missions) {
    const dropdown = document.querySelector('.programselect');
    if (!dropdown) return;

    // Clear existing options
    dropdown.innerHTML = '<option value="">Select Mission</option>';
    
    // Add new options
    missions.forEach(mission => {
        const option = document.createElement('option');
        option.value = mission.path;
        option.textContent = mission.name;
        dropdown.appendChild(option);
    });
}

// Add this function near the top of the file with other utility functions
function formatTerminalMessage(message) {
    // Check for different message types and add appropriate classes
    if (message.includes('Error') || message.includes('error') || message.includes('ERR')) {
        return `<div class="terminal-line error">${message}</div>`;
    } else if (message.includes('Warning') || message.includes('warning') || message.includes('WARN')) {
        return `<div class="terminal-line warning">${message}</div>`;
    } else if (message.includes('Success') || message.includes('success') || message.includes('OK')) {
        return `<div class="terminal-line success">${message}</div>`;
    } else if (message.includes('SERVO') || message.includes('NED') || message.includes('MTL')) {
        return `<div class="terminal-line command">${message}</div>`;
    } else {
        return `<div class="terminal-line">${message}</div>`;
    }
}



// Function to parse custom message format
function parseCustomMessageFormat(message) {
    // Remove curly braces and split by semicolon
    const parts = message.replace(/[{}]/g, '').split(';');
    const parsedMsg = {};

    parts.forEach(part => {
        const [key, value] = part.split(':');
        parsedMsg[key] = value;
    });

    return parsedMsg;
}

// Call the function periodically to update the UI
setInterval(fetchESPTerminalData, 1000); // Adjust the interval as needed

// Define the handleHeartbeat function
function handleHeartbeat(data) {
    // Process the heartbeat data
    console.log("Heartbeat received:", data);
    // Add any additional logic you need for handling heartbeat data
}


async function loadMissions() {
    try {
        const response = await fetch('/list_missions');
        if (!response.ok) throw new Error('Failed to fetch missions');

        const missions = await response.json();
        const programSelect = document.querySelector('.program-select');

        // Clear existing options
        programSelect.innerHTML = '<option value="">Select Mission</option>';

        // Populate the dropdown with missions
        missions.forEach(mission => {
            const option = document.createElement('option');
            option.value = mission; // Assuming mission is just the filename
            option.textContent = mission; // Display the mission name
            programSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading missions:', error);
    }
}

// Call loadMissions when the page loads
document.addEventListener('DOMContentLoaded', loadMissions);

