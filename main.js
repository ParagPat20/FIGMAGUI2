const { app, BrowserWindow, session } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        fullscreen: false,
        frame: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: true
        },
        autoHideMenuBar: true,
        alwaysOnTop: false,
        focusable: true
    });

    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self' http://127.0.0.1:5000; " +
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; " +
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; " +
                    "font-src 'self' https://fonts.gstatic.com; " +
                    "img-src 'self' data: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com; " +
                    "connect-src 'self' http://127.0.0.1:5000 https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com"
                ]
            }
        });
    });

    mainWindow.loadFile('index.html');

    mainWindow.maximize();

    mainWindow.webContents.session.clearCache(() => {
        console.log('Cache cleared');
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

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