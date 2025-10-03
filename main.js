const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ServerChecker = require('./server-checker');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 500,
        height: 800,
        minWidth: 450,
        minHeight: 600,
        frame: false,
        alwaysOnTop: false,
        transparent: true,
        resizable: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        icon: path.join(__dirname, 'icon.png')
    });

    mainWindow.loadFile('index.html');
    
    // Разработка: открыть инструменты разработчика
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC обработчики
ipcMain.handle('minimize-window', () => {
    mainWindow.minimize();
});

ipcMain.handle('close-window', () => {
    mainWindow.close();
});

ipcMain.handle('check-server', async (event, serverData) => {
    return await ServerChecker.checkServerStatus(serverData);
});

ipcMain.handle('save-servers', (event, servers) => {
    try {
        fs.writeFileSync('servers.json', JSON.stringify(servers, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error saving servers:', error);
        return false;
    }
});

ipcMain.handle('load-servers', () => {
    try {
        if (fs.existsSync('servers.json')) {
            const data = fs.readFileSync('servers.json', 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading servers:', error);
    }
    return [];
});

ipcMain.handle('show-dialog', async (event, options) => {
    const result = await dialog.showMessageBox(mainWindow, options);
    return result.response;
});