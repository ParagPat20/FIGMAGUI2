const { app, BrowserWindow, session } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        title: 'Oxitech - Swarm Control',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: true
        }
    });

    // Set fullscreen at startup
    mainWindow.setFullScreen(true);

    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self';",
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com;",
                    "connect-src 'self' http://localhost:5000 http://127.0.0.1:5000 https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com;",
                    "img-src 'self' data: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com;",
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com;",
                    "font-src 'self' https://fonts.gstatic.com;",
                    "script-src-elem 'self' 'unsafe-inline' https://unpkg.com;",
                    "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com;"
                ].join(' ')
            }
        });
    });

    mainWindow.loadFile('index.html');
}

// Update app name
app.name = 'Oxitech - Swarm Control';

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});