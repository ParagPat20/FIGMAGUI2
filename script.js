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
        this.attitudeInterval = null;
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
        modeBtn.addEventListener('click', () => this.handleMode(this.droneId));
        landBtn.addEventListener('click', () => this.handleLand(this.droneId));
        attitudeBtn.addEventListener('click', () => {
            this.startSendingAttitudeRequests(this.droneId);
        });
    }

    toggleSendingAttitudeRequests(droneId) {
        if (!this.attitudeInterval) {
            this.attitudeInterval = setInterval(() => {
                this.handleAttitude(droneId);
            }, 800);
            console.log(`Starting to send attitude requests for ${droneId}`);
        } else {
            clearInterval(this.attitudeInterval);
            this.attitudeInterval = null;
            console.log(`Stopping to send attitude requests for ${droneId}`);
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
        const altitude = altitudeInput ? altitudeInput.value : '2'; // Default to 2 if no value is entered
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
    const serialInputField = document.querySelector('.serial-input'); // Assuming there's an input field with this class
    const inputValue = serialInputField.value; // Get the value from the input field

    // Call the serialSend function with the input value
    serialSend(inputValue);
}

// Function to send the command based on the input value
function serialSend(valueString) {
    // Split the input string by semicolon
    const parts = valueString.split(';');

    // Ensure there are exactly three parts
    if (parts.length !== 3) {
        console.error('Input must contain exactly three parts separated by semicolons (target;command;payload)');
        return;
    }

    const target = parts[0].trim();   // First part as target
    const command = parts[1].trim();  // Second part as command
    const payload = parts[2].trim();   // Third part as payload

    // Call the send_command function with the parsed values
    send_command(target, command, payload);
}

// Example of adding an event listener to the send button
const serialSendButton = document.querySelector('.serial-send'); // Assuming there's a button with this class
serialSendButton.addEventListener('click', serialInput);

// Function to fetch data from /esp-terminal
async function fetchSerialData() {
    try {
        const response = await fetch('http://127.0.0.1:5000/esp-terminal');
        if (!response.ok) throw new Error('Failed to fetch serial data');
        
        const data = await response.json();
        if (data && data.length > 0) {
            console.log('Received serial data:', data);
            displaySerialData(data);
            data.forEach(line => handleEspTerminalData(line)); // Handle each line of data
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

let 

// Update handleDroneMessage to handle any drone
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

function handleEspTerminalData(data) {
    const parsedMsg = parseMessage(data);
    if (parsedMsg && parsedMsg.C === 'HB' && parsedMsg.P === '1') {
        // Add drone card using source ID from message
        const droneId = parsedMsg.S;
        if (!droneManager.drones.has(droneId)) {
            droneManager.addDrone(droneId, droneId);
            setupDroneCardEventListeners(droneId); // Setup event listeners for the new drone card
        }
    }
}

function setupDroneCardEventListeners(droneId) {
    const armBtn = document.querySelector(`.drone-control-btn.arm-btn[data-drone="${droneId}"]`);
    const launchBtn = document.querySelector(`.drone-control-btn.launch-btn[data-drone="${droneId}"]`);
    const landBtn = document.querySelector(`.drone-control-btn.land-btn[data-drone="${droneId}"]`);
    const modeBtn = document.querySelector(`.drone-control-btn.mode-btn[data-drone="${droneId}"]`);

    if (launchBtn) {
        launchBtn.addEventListener('click', () => {
            const defaultAltitude = '2'; // Default altitude value
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

