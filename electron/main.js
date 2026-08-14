const { app, BrowserWindow } = require('electron');
const path = require('path');

let win;

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'NeaiChat',
    webPreferences: { nodeIntegration: true },
  });
  win.loadFile(path.join(__dirname, '../dist/index.html'));
  win.on('closed', () => { win = null; });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (win === null) {
    app.whenReady().then(() => {
      win = new BrowserWindow({ width: 1280, height: 800, title: 'NeaiChat' });
      win.loadFile(path.join(__dirname, '../dist/index.html'));
    });
  }
});
