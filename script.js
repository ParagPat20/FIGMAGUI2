// Custom Alert Component
class CustomAlert {
    constructor() {
        this.alertContainer = null;
        this.initialize();
    }

    initialize() {
        // Create alert container if it doesn't exist
        if (!this.alertContainer) {
            this.alertContainer = document.createElement('div');
            this.alertContainer.className = 'custom-alert-container';
            document.body.appendChild(this.alertContainer);
        }
    }

    show(message, type = 'info', duration = 3000) {
        const alert = document.createElement('div');
        alert.className = `custom-alert custom-alert-${type}`;
        alert.innerHTML = `
            <div class="custom-alert-content">
                <span class="custom-alert-message">${message}</span>
            </div>
        `;
        
        this.alertContainer.appendChild(alert);
        
        // Trigger animation
        setTimeout(() => alert.classList.add('show'), 10);
        
        // Auto remove
        setTimeout(() => {
            alert.classList.remove('show');
            setTimeout(() => alert.remove(), 300);
        }, duration);
    }

    error(message) {
        this.show(message, 'error', 5000);
    }

    success(message) {
        this.show(message, 'success', 3000);
    }

    warning(message) {
        this.show(message, 'warning', 4000);
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


// Button Event Handlers
function initializeEventListeners() {
    // Add null checks before adding event listeners
    
    // Top Bar Controls
    elements.separationInput?.addEventListener('change', handleSeparationChange);
    elements.operatingAltInput?.addEventListener('change', handleAltitudeChange);
    elements.programSelect?.addEventListener('change', handleProgramChange);
    elements.startBtn?.addEventListener('click', handleStart);
    elements.pauseBtn?.addEventListener('click', handlePause);
    
    // Sidebar Menu
    elements.menuItems?.forEach(item => {
        item?.addEventListener('click', handleMenuClick);
    });
    
    // Drone Selection
    elements.droneMcuBtn?.addEventListener('click', handleDroneSelect);
    
    // MCU button
    elements.mcuButton?.addEventListener('click', handleDroneSelect);
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    initializeEventListeners();
    initializeMap();
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
            this.serialSend?.addEventListener('click', () => this.handleSerialSend());
            this.serialInput?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleSerialSend();
                }
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
        
        console.log('Updating port list UI...');
        this.portSelect.innerHTML = '<option value="" disabled selected>Select Port</option>';
        ports.forEach(port => {
            const option = document.createElement('option');
            option.value = port.port;
            option.textContent = `${port.port} - ${port.description}`;
            if (port.is_esp32) {
                option.setAttribute('data-is-esp32', 'true');
                console.log('Found ESP32 port:', port.port);
            }
            this.portSelect.appendChild(option);
        });

        if (this.currentPort) {
            console.log('Restoring previous port selection:', this.currentPort);
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
            const response = await fetch('http://127.0.0.1:5000/verify_port', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    port: portName,
                    command: JSON.stringify({
                        target: "GCS",
                        cmd_type: "HB",
                        cmd: "ping"
                    })
                })
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

    async sendHeartbeat() {
        try {
            const response = await this.sendCommand(JSON.stringify({
                to: "GCS",
                cmd_type: "HB",
                cmd: "ping"
            }));

            if (response && response.status === "ok") {
                // Change ESP NOW text color to green
                const espText = document.querySelector('.esp-now');
                if (espText) {
                    espText.style.color = '#70c172';
                }
                this.isConnected = true;
            } else {
                throw new Error('No heartbeat response');
            }
        } catch (error) {
            console.error('Heartbeat failed:', error);
            const espText = document.querySelector('.esp-now');
            if (espText) {
                espText.style.color = '#ffffff'; // Reset to white
            }
            this.isConnected = false;
            handleError(error, 'verifying ESP32 connection');
        }
    }

    async sendCommand(command) {
        try {
            if (!this.isConnected) {
                console.warn('Attempted to send command while not connected');
                throw new Error('Not connected to any port');
            }

            console.log(`Sending command: ${command}`);
            const response = await fetch('http://127.0.0.1:5000/send_command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command })
            });

            if (!response.ok) throw new Error('Failed to send command');
            
            const result = await response.json();
            console.log('Command response:', result);
            
            if (result.status === "ok" || result.response === "OK") {
                return { status: "ok" };
            }
            
            throw new Error('Invalid response');
            
        } catch (error) {
            console.error('Error sending command:', error);
            handleError(error, 'sending command');
            return null;
        }
    }

    async handleSerialSend() {
        if (!this.serialInput || !this.isConnected) return;
        
        const command = this.serialInput.value.trim();
        if (!command) return;
        
        try {
            // Format command as JSON
            const jsonCommand = JSON.stringify({
                target: "MCU",
                cmd_type: "CMD",
                cmd: command
            });
            
            await this.sendCommand(jsonCommand);
            this.serialInput.value = '';  // Clear input after sending
        } catch (error) {
            console.error('Failed to send serial command:', error);
            handleError(error, 'sending serial command');
        }
    }
}

// Initialize serial connection
const serialConnection = new SerialConnection();

// Drone Control Functions
async function handleArm() {
    try {
        const armButton = elements.armBtn;
        const resetLoading = showButtonLoading(armButton);

        currentDrone.isArmed = !currentDrone.isArmed;
        
        await serialConnection.sendCommand(currentDrone.isArmed ? 'ARM' : 'DISARM');
        
        resetLoading();
        
        if (currentDrone.isArmed) {
            armButton.style.background = '#f05151';
            armButton.classList.add('active');
            customAlert.success('Drone armed successfully');
        } else {
            armButton.style.background = '#70c172';
            armButton.classList.remove('active');
            customAlert.success('Drone disarmed successfully');
        }
        
        updateDroneStatus();
    } catch (error) {
        handleError(error, 'arming/disarming');
    }
}

async function handleLaunch() {
    try {
        await validateDroneState();
        
        await serialConnection.sendCommand('LAUNCH');
        currentDrone.isFlying = true;
        
        const launchButton = elements.launchBtn;
        const landButton = elements.landBtn;
        
        launchButton.style.background = '#70c172';
        launchButton.disabled = true;
        
        landButton.style.background = '#f2d2f2';
        landButton.disabled = false;
        
        customAlert.success('Drone launched successfully');
        updateDroneStatus();
        
    } catch (error) {
        handleError(error, 'launching');
    }
}

async function handleLand() {
    try {
        if (!currentDrone.isFlying) {
            throw new Error('Drone is not flying');
        }
        
        await serialConnection.sendCommand('LAND');
        currentDrone.isFlying = false;
        
        const landButton = elements.landBtn;
        const launchButton = elements.launchBtn;
        
        landButton.style.background = '#f05151';
        landButton.disabled = true;
        
        launchButton.style.background = '#f2f2f2';
        launchButton.disabled = false;
        
        customAlert.success('Drone landing initiated');
        updateDroneStatus();
        
    } catch (error) {
        handleError(error, 'landing');
    }
}

async function handlePosHold() {
    try {
        if (!currentDrone.isFlying) {
            throw new Error('Drone must be flying to use position hold');
        }
        
        currentDrone.isPosHold = !currentDrone.isPosHold;
        await serialConnection.sendCommand(currentDrone.isPosHold ? 'POSHOLD_ON' : 'POSHOLD_OFF');
        
        elements.posholdBtn.style.background = currentDrone.isPosHold ? '#f05151' : '#2c7bf2';
        
        customAlert.success(`Position hold ${currentDrone.isPosHold ? 'enabled' : 'disabled'}`);
        updateDroneStatus();
        
    } catch (error) {
        handleError(error, 'toggling position hold');
    }
}

function handleModes() {
    const modesDropdown = document.querySelector('.modes-dropdown');
    const modesButton = elements.modesBtn;
    
    const isHidden = modesDropdown.style.display === 'none';
    
    if (isHidden) {
        const buttonRect = modesButton.getBoundingClientRect();
        modesDropdown.style.display = 'block';
        
        // Trigger animation
        setTimeout(() => {
            modesDropdown.classList.add('show');
        }, 10);
        
        modesButton.style.background = '#2c7bf2';
        
        document.querySelectorAll('.mode-option').forEach(opt => {
            opt.classList.remove('active');
            if (opt.dataset.mode === currentDrone.currentMode) {
                opt.classList.add('active');
            }
        });
    } else {
        modesDropdown.classList.remove('show');
        setTimeout(() => {
            modesDropdown.style.display = 'none';
        }, 200);
        modesButton.style.background = '#ffab49';
    }
}

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

function handleStart() {
    const startBtn = elements.startBtn;
    const startLabel = startBtn.querySelector('.start-label');
    const pauseBtn = elements.pauseBtn;
    
    // Toggle between start and stop states
    const isStarted = startBtn.classList.contains('stop');
    
    if (!isStarted) {
        // Change to stop state
        startBtn.classList.add('stop');
        startBtn.style.background = '#f05151';
        startLabel.textContent = 'STOP';
        startBtn.classList.add('active');
        pauseBtn.disabled = false;
        
        // Start the mission
        startMission();
    } else {
        // Change back to start state
        startBtn.classList.remove('stop');
        startBtn.style.background = '#70c172';
        startLabel.textContent = 'START';
        startBtn.classList.remove('active');
        pauseBtn.disabled = true;
        
        // Stop the mission
        stopMission();
    }
}

function handlePause() {
    elements.pauseBtn.disabled = true;
    elements.startBtn.disabled = false;
    pauseMission();
}

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
    }
}

// Drone Selection Function
function handleDroneSelect() {
    const mcuButton = elements.mcuButton;
    mcuButton.classList.toggle('active');
    
    if (mcuButton.classList.contains('active')) {
        mcuButton.style.background = '#f05151';
        customAlert.success('MCU selected');
    } else {
        mcuButton.style.background = '#0f2951';
        customAlert.info('MCU deselected');
    }
}

// Utility Functions
function updateDroneStatus() {
    // Update UI elements with current drone state
    document.querySelector('.altitude').textContent = `Altitude: ${currentDrone.currentAltitude}m`;
    document.querySelector('.mode').textContent = `Mode: ${currentDrone.currentMode}`;
    document.querySelector('.battery').textContent = `Battery: ${currentDrone.batteryLevel}%`;
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
    // Implementation for missions view
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
        this.updateInterval = null;
    }

    createCard() {
        const card = document.createElement('div');
        card.className = 'drone-card';
        card.innerHTML = `
            <div class="drone-card-header">
                <span class="drone-name">${this.name}</span>
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
                            <span data-param="battery">BAT 75%</span>
                        </div>
                        <div class="param-overlay distance">
                            <span data-param="distance">0m</span>
                        </div>
                        <div class="param-overlay gps">
                            <span data-param="gps">3D Fix (8)</span>
                        </div>
                        <div class="param-overlay mode">
                            <span data-param="mode">GUIDE</span>
                        </div>
                        <div class="altitude-display">
                            <span class="altitude-value" data-param="altitude">0.0m</span>
                        </div>
                    </div>
                    <div class="drone-controls">
                        <button class="drone-control-btn arm-btn" data-drone="${this.droneId}">ARM</button>
                        <button class="drone-control-btn launch-btn" data-drone="${this.droneId}">LAUNCH</button>
                        <button class="drone-control-btn mode-btn" data-drone="${this.droneId}">MODE</button>
                        <button class="drone-control-btn land-btn" data-drone="${this.droneId}">LAND</button>
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

        armBtn.addEventListener('click', () => this.handleArm());
        launchBtn.addEventListener('click', () => this.handleLaunch());
        modeBtn.addEventListener('click', () => this.handleMode());
        landBtn.addEventListener('click', () => this.handleLand());
    }

    async handleArm() {
        try {
            const armBtn = this.element.querySelector('.arm-btn');
            const isArmed = armBtn.classList.contains('armed');
            
            const command = JSON.stringify({
                target: 'MCU',
                cmd_type: 'CMD',
                cmd: isArmed ? 'DISARM' : 'ARM'
            });

            await serialConnection.sendCommand(command);
            
            armBtn.classList.toggle('armed');
            armBtn.textContent = isArmed ? 'ARM' : 'DISARM';
            
            customAlert.success(`Drone ${isArmed ? 'disarmed' : 'armed'} successfully`);
        } catch (error) {
            handleError(error, 'arming/disarming');
        }
    }

    // Add other handler methods similarly...

    updateParams(params) {
        Object.entries(params).forEach(([key, value]) => {
            const element = this.element.querySelector(`[data-param="${key}"]`);
            if (element) {
                // Update the text content based on the parameter type
                switch(key) {
                    case 'heading':
                        element.textContent = value;
                        break;
                    case 'battery':
                        element.textContent = value;
                        break;
                    case 'mode':
                        element.textContent = value;
                        break;
                    case 'gps':
                        element.textContent = value;
                        break;
                    case 'altitude':
                        element.textContent = value;
                        break;
                    case 'distance':
                        element.textContent = value;
                        break;
                    default:
                        element.textContent = value;
                }
                
                if (key === 'battery' && parseInt(value) < 20) {
                    element.className = 'param-value error';
                } else if (key === 'battery' && parseInt(value) < 50) {
                    element.className = 'param-value warning';
                }
            }
        });

        // Update attitude indicator
        if (params.roll !== undefined || params.pitch !== undefined) {
            const horizon = this.element.querySelector('.attitude-horizon');
            if (horizon) {
                const roll = params.roll || 0;
                const pitch = params.pitch || 0;
                
                // Update horizon position
                horizon.style.transform = `rotate(${roll}deg) translateY(${pitch}%)`;
            }
        }
    }
}

// Drone management
const droneManager = {
    drones: new Map(),
    
    addDrone(droneId, name) {
        if (!this.drones.has(droneId)) {
            const droneCard = new DroneCard(droneId, name);
            const container = document.querySelector('.drone-cards-container');
            container.appendChild(droneCard.element);
            this.drones.set(droneId, droneCard);
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
    }
};

// Example usage:
// When new drones connect:
droneManager.addDrone('drone1', 'MCU-1');
droneManager.addDrone('drone2', 'MCU-2'); 
droneManager.addDrone('drone3', 'MCU-3');

// Simulate changing parameters
setInterval(() => {
    // Generate random values
    const altitude = Math.floor(Math.random() * 100);
    const heading = Math.floor(Math.random() * 360);
    
    // Example coordinates (replace with real drone coordinates)
    const latitude = 28.5383 + (Math.random() - 0.5) * 0.001;  // Small random movement
    const longitude = 77.3447 + (Math.random() - 0.5) * 0.001; // Small random movement

    // Update drone marker with new position and data
    updateDroneMarker(
        'drone1',
        [latitude, longitude],
        heading,
        altitude,
        'MCU-1'  // Added drone name
    );

}, 1000); // Update every second

class MissionPlanner {
    constructor() {
        this.popup = document.querySelector('.mission-planner-popup');
        this.canvas2D = document.getElementById('mission-canvas-2d');
        this.canvas3D = document.getElementById('mission-canvas-3d');
        this.ctx2D = this.canvas2D.getContext('2d');
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        this.waypoints = new Map();
        this.selectedDrone = null;
        this.isDragging = false;
        
        this.initializeListeners();
    }
    
    show() {
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
            
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
            directionalLight.position.set(10, 10, 10);
            this.scene.add(ambientLight);
            this.scene.add(directionalLight);
            
            this.camera.position.set(20, 20, 20);
            this.camera.lookAt(0, 0, 0);
            
            const gridHelper = new THREE.GridHelper(100, 100, 0x70c172, 0x1c2b40);
            this.scene.add(gridHelper);
            
            this.animate();
            this.resizeCanvases();
        } catch (error) {
            console.error('Error initializing 3D scene:', error);
        }
    }
    
    resizeCanvases() {
        const container = document.querySelector('.view-container');
        if (!container) return;
        
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        if (this.canvas2D) {
            this.canvas2D.width = width;
            this.canvas2D.height = height;
        }
        
        if (this.renderer && this.camera) {
            this.renderer.setSize(width, height);
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
        }
        
        this.update2DView();
    }
    
    animate() {
        if (!this.renderer || !this.scene || !this.camera) return;
        
        requestAnimationFrame(() => this.animate());
        
        if (this.controls) {
            this.controls.update();
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    initializeListeners() {
        // View toggle buttons
        document.querySelectorAll('.view-toggle').forEach(button => {
            button.addEventListener('click', () => this.toggleView(button.dataset.view));
        });
        
        // Close button
        document.querySelector('.close-mission-planner').addEventListener('click', () => this.hide());
        
        // Canvas interactions
        this.canvas2D.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e));
        this.canvas2D.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
        this.canvas2D.addEventListener('mouseup', () => this.handleCanvasMouseUp());
        
        // Save and clear buttons
        document.querySelector('.save-mission').addEventListener('click', () => this.saveMission());
        document.querySelector('.clear-mission').addEventListener('click', () => this.clearMission());
        
        // Window resize
        window.addEventListener('resize', () => this.resizeCanvases());
    }

    hide() {
        this.popup.classList.remove('active');
        setTimeout(() => this.popup.style.display = 'none', 300);
    }

    handleCanvasMouseDown(e) {
        const rect = this.canvas2D.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.isDragging = true;
        // Handle mouse down logic
    }

    handleCanvasMouseMove(e) {
        if (!this.isDragging) return;
        const rect = this.canvas2D.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        // Handle mouse move logic
    }

    handleCanvasMouseUp() {
        this.isDragging = false;
        // Handle mouse up logic
    }

    saveMission() {
        // Save mission logic
        console.log('Saving mission...');
        // Implement saving waypoints and mission parameters
    }

    clearMission() {
        // Clear mission logic
        console.log('Clearing mission...');
        this.waypoints.clear();
        this.update2DView();
        this.update3DView();
    }

    toggleView(view) {
        document.querySelectorAll('.view-toggle').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        
        this.canvas2D.classList.toggle('active', view === '2d');
        this.canvas3D.classList.toggle('active', view === '3d');
        
        if (view === '3d') {
            this.update3DView();
        } else {
            this.update2DView();
        }
    }

    update2DView() {
        if (!this.ctx2D) return;
        // Clear canvas
        this.ctx2D.clearRect(0, 0, this.canvas2D.width, this.canvas2D.height);
        // Draw waypoints and connections
        // Implement 2D visualization
    }

    update3DView() {
        if (!this.scene) return;
        // Update 3D visualization
        // Implement 3D visualization
    }

    updateAvailableDrones() {
        const droneList = document.querySelector('.drone-list');
        droneList.innerHTML = '';
        
        // Add connected drones to the list
        droneManager.drones.forEach((drone, id) => {
            const droneItem = document.createElement('div');
            droneItem.className = 'drone-item';
            droneItem.draggable = true;
            droneItem.textContent = drone.name;
            droneItem.dataset.droneId = id;
            
            droneItem.addEventListener('dragstart', (e) => {
                this.selectedDrone = id;
                e.dataTransfer.setData('text/plain', id);
            });
            
            droneList.appendChild(droneItem);
        });
    }
}

// Initialize mission planner when menu item is clicked
document.getElementById('menu-missions').addEventListener('click', () => {
    if (!window.missionPlanner) {
        window.missionPlanner = new MissionPlanner();
    }
    window.missionPlanner.show();
});