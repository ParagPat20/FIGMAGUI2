// Expose only required APIs to renderer process
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Add any required electron APIs here
    // For now, we don't need any since we're using HTTP
}); 