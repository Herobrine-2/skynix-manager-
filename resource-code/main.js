const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, Notification, nativeImage } = require('electron');
const path = require('path');
// OAuth credentials stay in the ignored local file (or environment variables).
let localSecrets = {};
try { localSecrets = require('./secrets.local.js'); } catch (_) {}
const fs = require('fs');
const DiscordRPC = require('discord-rpc');
const { exec, execFile, spawn } = require('child_process');
// Windows bildirimleri uygulamayı Electron olarak değil Skynix Manager olarak
// tanısın. Bu çağrı app.whenReady() öncesinde yapılmalıdır.
app.setName('Skynix Manager');
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
if (process.platform === 'win32') app.setAppUserModelId('com.skynix.manager');
//           installed/, profiles/, userdata/ -> process.resourcesPath içi
function getAppRoot() {
  return app.isPackaged ? process.resourcesPath : __dirname;
}

function getUserDataDir() {
  return app.isPackaged ? app.getPath('userData') : __dirname;
}

function resolveModToolsPath() {
  const candidates = [
    path.join(getAppRoot(), 'tools', 'mod-tools.exe'),
    path.join(getAppRoot(), 'tools', 'cslol-tools.exe'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'tools', 'mod-tools.exe'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'tools', 'cslol-tools.exe'),
    path.join(__dirname, 'tools', 'mod-tools.exe'),
    path.join(__dirname, 'tools', 'cslol-tools.exe'),
    path.join(getAppRoot(), 'mod-tools.exe')
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
}

let mainWindow;
let activeModProcess = null;
let autoHiddenForGame = false;
let overlayOperationInProgress = false;
const preparedOverlayKeyFile = path.join(getUserDataDir(), "prepared-overlay-key.txt");
let preparedOverlayKey = (() => { try { if (fs.existsSync(preparedOverlayKeyFile)) return fs.readFileSync(preparedOverlayKeyFile, "utf8").trim(); } catch (_) {} return null; })();

function cleanupLingeringToolProcesses() {
  if (activeModProcess) return;
  for (const name of ['mod-tools.exe', 'cslol-tools.exe']) {
    execFile('taskkill', ['/F', '/IM', name, '/T'], { windowsHide: true }, () => {});
  }
}

function stopActiveModProcess() {
  const proc = activeModProcess;
  activeModProcess = null;
  if (!proc) return;
  const pid = proc.pid;
  try { proc.kill(); } catch (_) {}
  if (process.platform === 'win32' && pid) {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {});
  }
}

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ SKÃƒâ€Ã‚°N VERÃƒâ€Ã‚°TABANI OTOMATÃƒâ€Ã‚°K CACHE Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
let cachedDbFolder = null;
let cachedIndexData = null;
const sourceCopyCachePath = path.join(getUserDataDir(), 'source-copy-cache.json');
function getDirectorySignature(root) {
  let count = 0; let newest = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      try { const stat = fs.statSync(full); newest = Math.max(newest, stat.mtimeMs); count++; if (entry.isDirectory()) walk(full); } catch (_) {}
    }
  };
  try { walk(root); } catch (_) {}
  return `${count}:${newest}`;
}

async function fetchOnlineIndexJson() {
  if (cachedIndexData) return cachedIndexData;
  try {
    const url = 'https://raw.githubusercontent.com/Herobrine-2/skynix-database/main/Skins/index.json';
    const res = await fetch(url);
    if (res.ok) {
      cachedIndexData = await res.json();
      console.log(`[DB] Online index.json basariyla yuklendi (${Object.keys(cachedIndexData.champions || {}).length} sampiyon)`);
    }
  } catch (e) {
    console.warn('[DB] Online index.json alinamadi:', e.message);
  }
  return cachedIndexData;
}

function initDbFolder() {
  if (cachedDbFolder && fs.existsSync(cachedDbFolder)) return;
  const userHome = app.getPath ? app.getPath('home') : '';
  const candidates = [
    path.join(getAppRoot(), 'Skynix Data base Skins'),
    path.join(__dirname, 'Skynix Data base Skins'),
    path.join(__dirname, '..', 'Skynix Data base Skins'),
    'W:\\Lol Custom manager By me\\Skynix Data base Skins',
    'C:\\Lol Custom manager By me\\Skynix Data base Skins',
    'D:\\Lol Custom manager By me\\Skynix Data base Skins',
    'E:\\Lol Custom manager By me\\Skynix Data base Skins',
    userHome ? path.join(userHome, 'Desktop', 'Skynix Data base Skins') : null,
    userHome ? path.join(userHome, 'Desktop', 'Lol Custom manager By me', 'Skynix Data base Skins') : null,
  ].filter(Boolean);

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      cachedDbFolder = c;
      const indexPath = path.join(c, 'index.json');
      if (fs.existsSync(indexPath)) {
        try {
          cachedIndexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
          console.log('[DB] Yerel index.json yuklendi: ' + indexPath);
        } catch (e) {
          console.error('[DB] index.json okunamadi:', e.message);
        }
      }
      console.log('[DB] Veritabani klasoru bulundu: ' + cachedDbFolder);
      break;
    }
  }
  if (!cachedIndexData) fetchOnlineIndexJson();
}

// AUTO-DOWNLOADER
const GITHUB_RELEASE_DOWNLOAD_URLS = [
  'https://github.com/Herobrine-2/skynix-database/releases/download/1.0.3',
  'https://github.com/Herobrine-2/skynix-database/releases/latest/download'
];

async function checkAndDownloadRequiredTools(onProgress) {
  const toolsDir = path.join(getAppRoot(), 'tools');
  if (!fs.existsSync(toolsDir)) fs.mkdirSync(toolsDir, { recursive: true });

  const requiredFiles = [
    { name: 'hashes.game.txt', relPath: 'tools/hashes.game.txt' },
    { name: 'hashes.game3131.txt', relPath: 'tools/hashes.game3131.txt' },
    { name: 'hashes.shaders.txt', relPath: 'tools/hashes.shaders.txt' },
    { name: 'manifests.json', relPath: 'tools/manifests.json' }
  ];

  for (const file of requiredFiles) {
    const localPath = path.join(getAppRoot(), file.relPath);
    if (!fs.existsSync(localPath) || fs.statSync(localPath).size === 0) {
      console.log('[AutoDownloader] Eksik dosya: ' + file.name);
      if (onProgress) onProgress('Indiriliyor: ' + file.name + '...');
      let downloaded = false;
      for (const baseUrl of GITHUB_RELEASE_DOWNLOAD_URLS) {
        if (downloaded) break;
        try {
          const res = await fetch(baseUrl + '/' + file.name);
          if (res.ok) {
            const buffer = await res.arrayBuffer();
            fs.writeFileSync(localPath, Buffer.from(buffer));
            console.log('[AutoDownloader] ' + file.name + ' basariyla indirildi.');
            downloaded = true;
          }
        } catch (err) {
          console.warn('[AutoDownloader] Fetch hatasi:', err.message);
        }
      }
      if (!downloaded) {
        console.error('[AutoDownloader] ' + file.name + ' indirilemedi.');
        if (onProgress) onProgress('HATA: ' + file.name + ' indirilemedi.');
      }
    }
  }
}

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ LOL GAME KLASÖRÜNÜ AKILLI TESPÃƒâ€Ã‚°T EDÃƒâ€Ã‚°CÃƒâ€Ã‚°
function findGameDir(lolExePath) {
  if (lolExePath) {
    let p = lolExePath.trim();
    let dir = fs.existsSync(p) && fs.statSync(p).isDirectory() ? p : path.dirname(p);
    if (path.basename(dir).toLowerCase() === 'game') return dir;
    const gameSub = path.join(dir, 'Game');
    if (fs.existsSync(path.join(gameSub, 'League of Legends.exe')) || fs.existsSync(gameSub)) return gameSub;
    const parentDir = path.dirname(dir);
    const parentGameSub = path.join(parentDir, 'Game');
    if (fs.existsSync(path.join(parentGameSub, 'League of Legends.exe')) || fs.existsSync(parentGameSub)) return parentGameSub;
    if (fs.existsSync(path.join(dir, 'League of Legends.exe'))) return dir;
  }
  const defaults = [
    'C:\\Riot Games\\League of Legends\\Game',
    'D:\\Riot Games\\League of Legends\\Game',
    'E:\\Riot Games\\League of Legends\\Game',
    'W:\\Riot Games\\League of Legends\\Game',
  ];
  for (const d of defaults) {
    if (fs.existsSync(path.join(d, 'League of Legends.exe')) || fs.existsSync(d)) return d;
  }
  return 'C:\\Riot Games\\League of Legends\\Game';
}

function createWindow() {
  const iconPath = fs.existsSync(path.join(__dirname, 'icon.png'))
    ? path.join(__dirname, 'icon.png')
    : null;

  mainWindow = new BrowserWindow({
    width: 1080,
    height: 740,
    frame: false,
    icon: iconPath || undefined,
    backgroundColor: '#05070b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });
  // Windows görev çubuğunun Electron kimliğine dönmesini engellemek için
  // pencere ikonunu ve AppUserModelId bilgisini açıkça eşleştir.
  if (iconPath) {
    try {
      mainWindow.setIcon(nativeImage.createFromPath(iconPath));
      if (typeof mainWindow.setAppDetails === 'function') {
        mainWindow.setAppDetails({
          appId: 'com.skynix.manager',
          appIconPath: iconPath,
          appIconIndex: 0,
          relaunchDisplayName: 'Skynix Manager',
          relaunchCommand: process.execPath
        });
      }
    } catch (iconErr) {
      console.warn('[Icon] Windows görev çubuğu ikonu ayarlanamadı:', iconErr.message);
    }
  }
  // Discord ve diğer harici bağlantıları uygulama içinde değil,
  // kullanıcının varsayılan tarayıcısında aç.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });  mainWindow.setMenu(null);
  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.maximize();
      mainWindow.show();
    }
  });
}

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ DISCORD RICH PRESENCE (RPC) INTEGRATION Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
const clientId = '1534926430411030578';
let rpc = null;

function initDiscordRPC() {
  try {
    DiscordRPC.register(clientId);
    rpc = new DiscordRPC.Client({ transport: 'ipc' });

    rpc.on('ready', () => {
      console.log('Discord RPC ready.');
      updateDiscordPresence('Idle', 'Managing skins');
    });

    rpc.login({ clientId }).catch((err) => {
      console.error('Discord RPC login failed:', err.message);
    });
  } catch (e) {
    console.error('Discord RPC initialization error:', e.message);
  }
}

const rpcStartTime = new Date();

function updateDiscordPresence(state, details) {
  if (!rpc) return;
  try {
    rpc.setActivity({
      state: state || 'Ana Ekran - Boşta',
      details: details || 'Skynix Manager NextGen',
      startTimestamp: rpcStartTime,
      // Discord RPC görselleri URL deÃƒâ€Ã…¸il, Developer Portal'daki asset anahtarÃƒâ€Ã‚±dÃƒâ€Ã‚±r.
      largeImageKey: 'skynix_logo',
      largeImageText: 'Skynix Manager v2.0 • NextGen',
      smallImageKey: 'skynix_logo',
      smallImageText: 'Skynix Manager',
      buttons: [
        { label: 'Discord Sunucusuna Katıl', url: 'https://discord.gg/2cTNwPWTeE' }
      ],
      instance: false
    });
  } catch (err) {
    console.error('Discord RPC update presence failed:', err.message);
  }
}

ipcMain.on('update-presence', (event, data) => {
  updateDiscordPresence(data.state, data.details);
});

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ DISCORD OAUTH2 GÃƒâ€Ã‚°RÃƒâ€Ã‚°Ãƒâ€¦Ã‚ AKIÃƒâ€¦Ã‚I Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
// Ãƒ¢Ã…¡Ã‚ Ãƒ¯Ã‚¸Ã‚ Kendi Discord OAuth App bilgilerinizi girin:
// https://discord.com/developers/applications adresinden app oluşturun
const DISCORD_OAUTH_CLIENT_ID = process.env.DISCORD_OAUTH_CLIENT_ID || localSecrets.discordClientId || '';
const DISCORD_OAUTH_CLIENT_SECRET = process.env.DISCORD_OAUTH_CLIENT_SECRET || localSecrets.discordClientSecret || '';
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || localSecrets.discordGuildId || ''; // discord.gg/2cTNwPWTeE sunucu ID'si
const DISCORD_ADMIN_ROLE_NAME = 'Herobrine'; // Bu role sahip olanlar Admin olur
const OAUTH_REDIRECT_PORT = 47225;
const OAUTH_REDIRECT_URI = `http://localhost:${OAUTH_REDIRECT_PORT}/callback`;
const DISCORD_AUTH_SERVER_URL = 'https://skynix-auth-server.onrender.com';

let discordOAuthWindow = null;

// Electron'un bazÃƒâ€Ã‚± Windows kurulumlarÃƒâ€Ã‚±nda global fetch Discord TLS baÃƒâ€Ã…¸lantÃƒâ€Ã‚±sÃƒâ€Ã‚±nÃƒâ€Ã‚±
// "fetch failed" ile kesebiliyor. OAuth istekleri için yerleşik https istemcisini
// kullanarak daha güvenilir bir yedek baÃƒâ€Ã…¸lantÃƒâ€Ã‚± saÃƒâ€Ã…¸la.
function discordApiRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const target = new URL(url);
    const body = options.body ? String(options.body) : null;
    const req = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      method: options.method || 'GET',
      headers: { ...(options.headers || {}), ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}) }
    }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: JSON.parse(raw || '{}') }); }
        catch (_) { resolve({ ok: false, status: res.statusCode, data: {} }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function loginViaRemoteAuth() {
  const state = require('crypto').randomBytes(24).toString('hex');
  const startUrl = `${DISCORD_AUTH_SERVER_URL}/oauth/start?state=${encodeURIComponent(state)}`;
  shell.openExternal(startUrl);

  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      const response = await fetch(`${DISCORD_AUTH_SERVER_URL}/oauth/poll?state=${encodeURIComponent(state)}`, { cache: 'no-store' });
      if (!response.ok) continue;
      const result = await response.json();
      if (result.pending) continue;
      if (!result.success) return result;
      const user = result.user || {};
      const isAdmin = user.isAdmin === true;
      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          globalName: user.global_name || user.globalName || user.username,
          avatar: user.avatar ? (String(user.avatar).startsWith('http') ? user.avatar : `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`) : `https://cdn.discordapp.com/embed/avatars/0.png`,
          isAdmin
        }
      };
    } catch (_) {}
  }
  return { success: false, error: 'Zaman aşımı. Lütfen tekrar deneyin.' };
}
ipcMain.handle('discord-oauth-login', async () => {
  if (DISCORD_AUTH_SERVER_URL) return loginViaRemoteAuth();
  return new Promise((resolve) => {
    // Önceki pencereyi kapat
    if (discordOAuthWindow && !discordOAuthWindow.isDestroyed()) {
      discordOAuthWindow.close();
    }

    const scopes = ['identify', 'guilds', 'guilds.members.read'];
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_OAUTH_CLIENT_ID}&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}&response_type=code&scope=${scopes.join('%20')}`;

    // Küçük bir HTTP server aç redirect için
    const http = require('http');
    const server = http.createServer(async (req, res) => {
      if (!req.url.startsWith('/callback')) return;

      const urlObj = new URL(`http://localhost${req.url}`);
      const code = urlObj.searchParams.get('code');
      const errParam = urlObj.searchParams.get('error');

      // TarayÃƒâ€Ã‚±cÃƒâ€Ã‚±ya baÃƒâ€¦Ã…¸arÃƒâ€Ã‚± sayfasÃƒâ€Ã‚± göster
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body style="background:#020305;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;"><div style="font-size:48px;margin-bottom:16px;">${errParam ? 'âŒ' : '✅'}</div><div style="font-size:20px;font-weight:800;">${errParam ? 'Giriş İptal Edildi' : 'Giriş Başarılı!'}</div><div style="font-size:13px;color:#64748b;margin-top:8px;">Bu pencereyi kapatabilirsiniz.</div></div></body></html>`);

      server.close();
      if (discordOAuthWindow && !discordOAuthWindow.isDestroyed()) discordOAuthWindow.close();

      if (errParam || !code) {
        return resolve({ success: false, error: 'Giriş iptal edildi.' });
      }

      try {
        // Code Ãƒ¢Ã¢â‚¬ ’ Token exchange
        const tokenRes = await discordApiRequest('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: DISCORD_OAUTH_CLIENT_ID,
            client_secret: DISCORD_OAUTH_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: OAUTH_REDIRECT_URI
          })
        });
        const tokenData = tokenRes.data;

        if (!tokenData.access_token) {
          return resolve({ success: false, error: 'Token alÃƒâ€Ã‚±namadÃƒâ€Ã‚±. Client Secret\'i kontrol et!' });
        }

        const accessToken = tokenData.access_token;

        // KullanÃƒâ€Ã‚±cÃƒâ€Ã‚± bilgilerini al
        const userRes = await discordApiRequest('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const userData = userRes.data;

        // Guild membership kontrolü
        const memberRes = await discordApiRequest(`https://discord.com/api/users/@me/guilds/${DISCORD_GUILD_ID}/member`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!memberRes.ok) {
          return resolve({
            success: false,
            error: `Skynix Discord sunucusunun üyesi deÃƒâ€Ã…¸ilsin!\ndiscord.gg/2cTNwPWTeE adresinden sunucuya katÃƒâ€Ã‚±l ve Üye rolünü al.`
          });
        }

        const memberData = memberRes.data;
        const roleNames = (memberData.roles || []).map(r => r.toString());

        // Rol listesini isimle almak için guild roles endpoint'e ihtiyaç var
        // KullanÃƒâ€Ã‚±cÃƒâ€Ã‚± adÃƒâ€Ã‚±yla Herobrine kontrolü yapÃƒâ€Ã‚±yoruz
        const username = userData.username || '';
        const globalName = userData.global_name || '';
        const isAdmin = username.toLowerCase() === 'herobrine' ||
                        globalName.toLowerCase() === 'herobrine' ||
                        (memberData.nick || '').toLowerCase() === 'herobrine' ||
                        (memberData.roles || []).length > 0; // Üye rolü varsa => erişim var

        // Sadece Herobrine kullanÃƒâ€Ã‚±cÃƒâ€Ã‚± adÃƒâ€Ã‚±na admin ver
        const isHerobrineAdmin = username.toLowerCase().includes('herobrine') ||
                                  globalName.toLowerCase().includes('herobrine') ||
                                  (memberData.nick || '').toLowerCase().includes('herobrine');

        // Rol var mÃƒâ€Ã‚± kontrolü (sadece @everyone olmayan bir rol Ãƒ¢Ã¢â‚¬ ’ Üye rolü demek)
        const hasMemberRole = (memberData.roles || []).length > 0;

        if (!hasMemberRole) {
          return resolve({
            success: false,
            error: `Sunucu üyesisin ama henüz Üye rolünü almamÃƒâ€Ã‚±Ãƒâ€¦Ã…¸sÃƒâ€Ã‚±n!\nSunucu kurallarÃƒâ€Ã‚±nÃƒâ€Ã‚± kabul ederek Üye rolünü al.`
          });
        }

        resolve({
          success: true,
          user: {
            id: userData.id,
            username: userData.username,
            globalName: userData.global_name,
            discriminator: userData.discriminator,
            avatar: userData.avatar
              ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
              : `https://cdn.discordapp.com/embed/avatars/${parseInt(userData.discriminator || '0') % 5}.png`,
            isAdmin: isHerobrineAdmin
          }
        });


      } catch (err) {
        resolve({ success: false, error: 'BaÃƒâ€Ã…¸lantÃƒâ€Ã‚± hatasÃƒâ€Ã‚±.' });
        resolve({ success: false, error: 'Baglanti hatasi.' });
      }
    });

    server.listen(OAUTH_REDIRECT_PORT, () => {
      shell.openExternal(authUrl);
      console.log('[Discord OAuth] Tarayicida acildi:', authUrl);
    });

    setTimeout(() => {
      server.close();
      resolve({ success: false, error: 'Zaman asimi. Tekrar deneyin.' });
    }, 120000);
  });
});

let isQuittingApp = false;
let tray = null;
let isSkinsRunning = false;
let isGameActive = false;

function resolveAppIcon() {
  const png = path.join(__dirname, 'icon.png');
  if (fs.existsSync(png)) return png;
  const ico = path.join(__dirname, 'icon.ico');
  if (fs.existsSync(ico)) return ico;
  return null;
}

function showSystemNotification(title, body) {
  try {
    // SADECE UYGULAMA TEPSİDEYKEN (Simge durumunda veya gizlenmişken) bildirim gönder!
    if (mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized()) {
      return; // Kullanıcı zaten uygulamanın açık ekranına bakıyorsa Windows bildirimi gösterme
    }

    const icon = resolveAppIcon();
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: title || 'Skynix Manager',
        body: body || '',
        icon: icon || undefined,
        silent: false
      });
      notif.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      });
      notif.show();
    }
  } catch (err) {
    console.warn('[Notification] Bildirim hatasi:', err.message);
  }
}

function updateTrayMenu() {
  if (!tray) return;
  const isTr = app.getLocale().toLowerCase().startsWith('tr');
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isTr ? 'Skynix Manager Ac' : 'Open Skynix Manager',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: isSkinsRunning
        ? (isTr ? 'Skinler: Aktif' : 'Skins: Active')
        : (isTr ? 'Skinler: Kapali' : 'Skins: Inactive'),
      enabled: false
    },
    {
      label: isTr ? 'Skinleri Baslat' : 'Start Skins',
      enabled: !isSkinsRunning,
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('tray-start-skins');
        }
      }
    },
    {
      label: isTr ? 'Skinleri Durdur' : 'Stop Skins',
      enabled: isSkinsRunning,
      click: () => {
        stopActiveModProcess();
        isSkinsRunning = false;
        updateTrayMenu();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('tray-stop-skins');
        }
      }
    },
    { type: 'separator' },
    {
      label: isTr ? 'Tamamen Kapat' : 'Quit Skynix Manager',
      click: () => {
        isQuittingApp = true;
        stopActiveModProcess();
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
  tray.setToolTip(isSkinsRunning ? 'Skynix Manager - Skinler Aktif' : 'Skynix Manager - Hazir');
}

function createTray() {
  if (tray) return;
  const iconPath = resolveAppIcon();
  if (!iconPath) return;
  try {
    tray = new Tray(iconPath);
    updateTrayMenu();
    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.warn('[Tray] Tepsi hatasi:', err.message);
  }
}

app.whenReady().then(async () => {
  if (!singleInstanceLock) return;
  // Şampiyon kütüphanesinden gelen varsayılan paketler için ayrı alan.
  // Böylece normal installed/ klasörüyle karışmaz ve cache temizliği bunu da
  // güvenli biçimde silebilir.
  try {
    fs.mkdirSync(path.join(getUserDataDir(), 'champion-defaults'), { recursive: true });
  } catch (_) {}
  initDbFolder();
  initDiscordRPC();
  createWindow();
  createTray();
});

app.on('before-quit', () => { isQuittingApp = true; stopActiveModProcess(); });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuittingApp) app.quit();
});

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ GERÇEK ZAMANLI LOL DURUMU KONTROLU VE IN-GAME OPTÃƒâ€Ã‚°MÃƒâ€Ã‚°ZASYON Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
function checkLolProcessStatus() {
  execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true }, (err, stdout) => {
    if (err || !stdout) return;
    const lowerOut = String(stdout).toLowerCase();
    const isActualMatchRunning = lowerOut.includes('"league of legends.exe"') || lowerOut.includes('"lol.exe"');
    const isClientRunning = lowerOut.includes('"leagueclient.exe"') || lowerOut.includes('"leagueclientux.exe"');

    if (isActualMatchRunning !== isGameActive) {
      isGameActive = isActualMatchRunning;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('in-game-optimization', isActualMatchRunning);
        if (isActualMatchRunning) {
          // LoL maçı başladığında (lol.exe veya League of Legends.exe) pencereyi tepsiye gizle
          autoHiddenForGame = true;
          if (mainWindow.webContents && mainWindow.webContents.setBackgroundThrottling) {
            mainWindow.webContents.setBackgroundThrottling(true);
          }
          mainWindow.hide();
        } else {
          // LoL maçı bittiğinde (lol.exe kapandığında) pencereyi tepsiden aç, full screen / maximize yap ve öne getir
          autoHiddenForGame = false;
          if (mainWindow.webContents && mainWindow.webContents.setBackgroundThrottling) {
            mainWindow.webContents.setBackgroundThrottling(false);
          }
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.maximize();
          mainWindow.focus();
          mainWindow.setAlwaysOnTop(true);
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.setAlwaysOnTop(false);
            }
          }, 1000);
        }
      }
    }
    sendLolStatus(isActualMatchRunning || isClientRunning);
  });
}

// ════════ LCU CHAMPION SELECT AUTO-DETECTION ════════
const https = require('https');
let lastPickedChampionId = null;
let currentLcuCredentials = null;
const insecureHttpsAgent = new https.Agent({ rejectUnauthorized: false });

function findLcuLockfile() {
  const candidateDirs = [
    'C:\\Riot Games\\League of Legends',
    'D:\\Riot Games\\League of Legends',
    'E:\\Riot Games\\League of Legends',
    'W:\\Riot Games\\League of Legends',
    path.dirname(findGameDir())
  ];
  for (const dir of candidateDirs) {
    try {
      const lf = path.join(dir, 'lockfile');
      if (fs.existsSync(lf)) return lf;
    } catch (_) {}
  }
  return null;
}

function readLcuCredentials() {
  const lf = findLcuLockfile();
  if (!lf) return null;
  try {
    const fd = fs.openSync(lf, 'r');
    const buffer = Buffer.alloc(512);
    const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
    fs.closeSync(fd);
    const content = buffer.toString('utf8', 0, bytesRead);
    const parts = content.split(':');
    if (parts.length >= 5) {
      return {
        port: parseInt(parts[2], 10),
        password: parts[3],
        authHeader: 'Basic ' + Buffer.from('riot:' + parts[3]).toString('base64')
      };
    }
  } catch (_) {}
  return null;
}

function checkChampSelect() {
  if (isGameActive) return;
  const creds = readLcuCredentials();
  if (!creds || !creds.port) return;

  const options = {
    hostname: '127.0.0.1',
    port: creds.port,
    path: '/lol-champ-select/v1/session',
    method: 'GET',
    headers: { 'Authorization': creds.authHeader },
    agent: insecureHttpsAgent,
    timeout: 1500
  };

  const req = https.request(options, (res) => {
    if (res.statusCode !== 200) return;
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
      try {
        const session = JSON.parse(rawData);
        const localCellId = session.localPlayerCellId;
        // Sadece şampiyon KİLİTLENDİĞİNDE (completed === true veya myTeam'de kilitli şampiyon) tetikle!
        // Önizleme / fareyle üzerine gelip gösterme durumlarını (hover / intent) yoksay.
        let isLockedIn = false;

        if (Array.isArray(session.actions)) {
          for (const group of session.actions) {
            for (const action of group) {
              if (action.actorCellId === localCellId && action.type === 'pick') {
                if (action.completed && action.championId > 0) {
                  myChampionId = action.championId;
                  isLockedIn = true;
                }
              }
            }
          }
        }

        // ARAM, Blind Pick veya actions tamamlanmış durumlar için myTeam kontrolü
        if (!isLockedIn && Array.isArray(session.myTeam)) {
          const me = session.myTeam.find(p => p.cellId === localCellId);
          // Eğer me.championId varsa ve actions içinde devam eden bir pick yoksa kilitlenmiş kabul et
          if (me && me.championId > 0) {
            const hasActivePickAction = Array.isArray(session.actions) && session.actions.some(group => 
              group.some(action => action.actorCellId === localCellId && action.type === 'pick' && !action.completed)
            );
            if (!hasActivePickAction) {
              myChampionId = me.championId;
              isLockedIn = true;
            }
          }
        }

        if (isLockedIn && myChampionId > 0 && myChampionId !== lastPickedChampionId) {
          lastPickedChampionId = myChampionId;
          console.log(`[LCU] Şampiyon Kilitlendi / Seçim Onaylandı (ID: ${myChampionId})`);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('lcu-champion-picked', { championId: myChampionId });
          }
        } else if (!session.myTeam || session.myTeam.length === 0) {
          // Lobi bittiğinde veya seçimden çıkıldığında sıfırla
          lastPickedChampionId = null;
        }
      } catch (_) {}
    });
  });
  req.on('error', () => {});
  req.end();
}

setInterval(checkChampSelect, 1500);
function sendLolStatus(isRunning) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('lol-status-change', isRunning);
  }
}

setTimeout(checkLolProcessStatus, 250);
setInterval(checkLolProcessStatus, 1000);

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ PENCERE EYLEMLERÃƒâ€Ã‚° (X Ãƒ¢Ã¢â‚¬ ’ TRAY'E GÃƒâ€Ã‚°ZLE) Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.on('window-action', (event, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  else if (action === 'close') mainWindow.hide();
});

ipcMain.on('set-skin-running-state', (event, running) => {
  isSkinsRunning = Boolean(running);
  updateTrayMenu();
});

ipcMain.on('show-skin-started-notification', (event, customLang) => {
  const isTr = customLang === 'tr' || (!customLang && app.getLocale().toLowerCase().startsWith('tr'));
  showSystemNotification(
    'Skynix Manager',
    isTr ? '✨ Skinler başarıyla başlatıldı! Oyuna girebilirsin.' : '✨ Skins activated! Ready for the game.'
  );
});


// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ LOL EXE SEÃƒÆ’Ã¢â‚¬¡Ãƒâ€Ã‚°CÃƒâ€Ã‚° Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.handle('select-lol-exe', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'LeagueClient.exe veya League of Legends.exe Seç',
    filters: [{ name: 'League of Legends', extensions: ['exe'] }]
  });
  return !result.canceled && result.filePaths.length > 0 ? result.filePaths[0] : null;
});

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ OTOMATIK INSTALLED KLASÖRÜNE KOPYALAYICI Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ OTOMATÃƒâ€Ã‚°K INSTALLED KLASÖRÜNE KOPYALAYICI VE FANTOME/ZIP AYIKLAYICI Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.handle('copy-to-installed', async (event, sourcePath) => {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  const installedDir = path.join(getUserDataDir(), 'installed');
  if (!fs.existsSync(installedDir)) fs.mkdirSync(installedDir, { recursive: true });

  const rawName = path.basename(sourcePath);
  const cleanName = rawName.replace(/\.(fantome|zip|rar|7z|raw)$/i, '').trim();
  const stat = fs.statSync(sourcePath);

  let destDir = path.join(installedDir, cleanName);

  try {
    if (stat.isDirectory()) {
      if (fs.existsSync(destDir) && destDir !== sourcePath) {
        fs.rmSync(destDir, { recursive: true, force: true });
      }
      fs.cpSync(sourcePath, destDir, { recursive: true });
      return destDir;
    } else {
      const ext = path.extname(sourcePath).toLowerCase();
      if (ext === '.fantome' || ext === '.zip') {
        const AdmZip = require('adm-zip');
        try {
          const zip = new AdmZip(sourcePath);
          if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
          zip.extractAllTo(destDir, true);
          return destDir;
        } catch (zipErr) {
          console.warn('[UnpackZip] Zip açma hatasÃƒâ€Ã‚±, dosya olarak kopyalanÃƒâ€Ã‚±yor:', zipErr.message);
          const fileDest = path.join(installedDir, rawName);
          if (sourcePath !== fileDest) fs.copyFileSync(sourcePath, fileDest);
          return fileDest;
        }
      } else {
        const fileDest = path.join(installedDir, rawName);
        if (sourcePath !== fileDest) fs.copyFileSync(sourcePath, fileDest);
        return fileDest;
      }
    }
  } catch (e) {
    console.error("Kopyalama/AyÃƒâ€Ã‚±klama HatasÃƒâ€Ã‚±:", e);
    return sourcePath;
  }
});

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ SKÃƒâ€Ã‚°N DOSYASI SEÃƒÆ’Ã¢â‚¬¡Ãƒâ€Ã‚°CÃƒâ€Ã‚° (.fantome, .zip, .rar, .7z, .wad, .client) Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.handle('select-skin-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Skin DosyalarÃƒâ€Ã‚±nÃƒâ€Ã‚± Seç (.fantome, .zip, .rar, .7z, .wad)',
    filters: [
      { name: 'LoL Skin Paketleri (*.fantome, *.zip, *.rar, *.7z, *.wad, *.client)', extensions: ['fantome', 'zip', 'rar', '7z', 'wad', 'client', 'raw'] },
      { name: 'Tüm Dosyalar (*.*)', extensions: ['*'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths;
});

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ SKÃƒâ€Ã‚°N KLASÖRÜ SEÃƒÆ’Ã¢â‚¬¡Ãƒâ€Ã‚°CÃƒâ€Ã‚° Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.handle('select-skin-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Skin Klasörünü Seç'
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});


// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ SKÃƒâ€Ã‚°N DOSYASINI DIÃƒâ€¦Ã‚A AKTAR (.fantome / .zip / Klasör) Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.handle('export-skin-file', async (event, { sourcePath, defaultName }) => {
  try {
    let targetPath = sourcePath;
    const installedDir = path.join(getUserDataDir(), 'installed');

    // 1) Aday yollarda ara
    if (!targetPath || !fs.existsSync(targetPath)) {
      if (sourcePath) {
        const base = path.basename(sourcePath);
        const cleanBase = base.replace(/\.(fantome|zip|rar)$/i, '');
        const cand1 = path.join(installedDir, base);
        const cand2 = path.join(installedDir, cleanBase);
        const cand3 = path.join(getAppRoot(), 'installed', base);
        const cand4 = path.join(getAppRoot(), 'installed', cleanBase);

        if (fs.existsSync(cand1)) targetPath = cand1;
        else if (fs.existsSync(cand2)) targetPath = cand2;
        else if (fs.existsSync(cand3)) targetPath = cand3;
        else if (fs.existsSync(cand4)) targetPath = cand4;
      }
    }

    // 2) installed/ dizininde arama yap
    if (!targetPath || !fs.existsSync(targetPath)) {
      if (fs.existsSync(installedDir)) {
        const items = fs.readdirSync(installedDir);
        const searchToken = (defaultName || sourcePath || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (searchToken) {
          const found = items.find(i => i.toLowerCase().replace(/[^a-z0-9]/g, '').includes(searchToken));
          if (found) {
            targetPath = path.join(installedDir, found);
          }
        }
      }
    }

    if (!targetPath || !fs.existsSync(targetPath)) {
      return { success: false, message: 'Skin dosyasÃƒâ€Ã‚±/klasÃƒÆ’Ã‚¶rÃƒÆ’Ã‚¼ bilgisayarda bulunamadÃƒâ€Ã‚±.' };
    }

    const stat = fs.statSync(targetPath);
    const cleanDefaultName = (defaultName || path.basename(targetPath)).replace(/[^a-zA-Z0-9_\-\.\s]/g, '_');
    const defaultFileName = cleanDefaultName.endsWith('.fantome') ? cleanDefaultName : `${cleanDefaultName}.fantome`;

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Skin DosyasÃƒâ€Ã‚±nÃƒâ€Ã‚± DÃƒâ€Ã‚±Ãƒâ€¦Ã…¸a Aktar (.fantome / .zip)',
      defaultPath: defaultFileName,
      filters: [
        { name: 'Fantome Mod Paketi (*.fantome)', extensions: ['fantome'] },
        { name: 'ZIP Arşivi (*.zip)', extensions: ['zip'] },
        { name: 'Tüm Dosyalar', extensions: ['*'] }
      ]
    });
    if (canceled || !filePath) return { canceled: true };

    if (stat.isDirectory()) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.fantome' || ext === '.zip') {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip();
        // A valid Fantome only needs canonical META/WAD trees.
        // Raw source assets and duplicates made archives several times larger.
        const wadDir = path.join(targetPath, 'WAD');
        const metaDir = path.join(targetPath, 'META');
        const hasWad = fs.existsSync(wadDir) && fs.statSync(wadDir).isDirectory();
        if (hasWad) {
          zip.addLocalFolder(wadDir, 'WAD');
          if (fs.existsSync(metaDir) && fs.statSync(metaDir).isDirectory()) zip.addLocalFolder(metaDir, 'META');
        } else {
          zip.addLocalFolder(targetPath);
        }
        zip.writeZip(filePath);
      } else {
        fs.cpSync(targetPath, filePath, { recursive: true });
      }
    } else {
      fs.copyFileSync(targetPath, filePath);
    }
    return { success: true, filePath };
  } catch (err) {
    console.error('[ExportSkin] Hata:', err.message);
    return { success: false, message: err.message };
  }
});

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ SKYFIXER / TOPAZ MOD FIXER INTEGRATION Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.handle('open-skyfixer', async (event, skinPath) => {
  try {
    if (!skinPath || typeof skinPath !== 'string' || !fs.existsSync(skinPath)) {
      return { ok: false, error: 'Skin klasörü bulunamadÃƒâ€Ã‚±.' };
    }
    const candidates = [
      'W:\\Custom Skins Program\\cslol-go',
      path.join(getAppRoot(), 'cslol-go'),
      path.join(getAppRoot(), 'tools', 'cslol-go')
    ];
    const root = candidates.find(p => fs.existsSync(path.join(p, 'ModLoader.exe')));
    if (!root) return { ok: false, error: 'cslol-go / ModLoader.exe bulunamadÃƒâ€Ã‚±.' };
    const targetRoot = path.join(root, 'installed');
    fs.mkdirSync(targetRoot, { recursive: true });
    const name = path.basename(skinPath).replace(/\.(fantome|zip|rar|7z|raw)$/i, '').trim();
    const target = path.join(targetRoot, name);
    if (path.resolve(skinPath) !== path.resolve(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      fs.cpSync(skinPath, target, { recursive: true });
    }
    const child = spawn(path.join(root, 'ModLoader.exe'), [], { cwd: root, detached: true, windowsHide: false, stdio: 'ignore' });
    child.unref();
    return { ok: true, path: target, message: 'Skyfixer açıldı. ModLoader içinden Skyfixer düğmesine basabilirsin.' };
  } catch (error) {
    console.error('[Skyfixer] Başlatma hatasÃƒâ€Ã‚±:', error);
    return { ok: false, error: error.message };
  }
});

function resolveWadExtractPath() {
  const candidates = [
    path.join(getAppRoot(), 'tools', 'wad-extract.exe'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'tools', 'wad-extract.exe'),
    path.join(__dirname, 'tools', 'wad-extract.exe')
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function resolveRuntimeHashPath() {
  const candidates = [
    path.join(getAppRoot(), 'tools', 'hashes.game.txt')
  ];
  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).size > 0) || null;
}

function resolveWadMakePath() {
  const candidates = [
    path.join(getAppRoot(), 'tools', 'wad-make.exe'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'tools', 'wad-make.exe'),
    path.join(__dirname, 'tools', 'wad-make.exe')
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function packFolderToWad(folderPath, targetWadPath) {
  const wadMake = resolveWadMakePath();
  if (!wadMake) throw new Error('wad-make.exe aracÃƒâ€Ã‚± bulunamadÃƒâ€Ã‚±.');
  const { execFileSync } = require('child_process');
  execFileSync(wadMake, [folderPath, targetWadPath], { windowsHide: true, stdio: 'ignore' });
  return targetWadPath;
}

function resolveOrPackWadFiles(source, tempDir) {
  const wadFiles = [];
  
  // 1. Look for WAD folder
  const wadDir = path.join(source, 'WAD');
  if (fs.existsSync(wadDir) && fs.statSync(wadDir).isDirectory()) {
    for (const entry of fs.readdirSync(wadDir, { withFileTypes: true })) {
      const full = path.join(wadDir, entry.name);
      if (entry.isFile() && (/\.wad\.client$/i.test(entry.name) || /\.wad$/i.test(entry.name))) {
        wadFiles.push(full);
      } else if (entry.isDirectory() && (/\.wad\.client$/i.test(entry.name) || /\.wad$/i.test(entry.name))) {
        // Unpacked folder format (like zed.wad.client folder) -> pack to wad
        const cleanName = entry.name.replace(/\.wad(?:\.client)?$/i, '');
        const targetWad = path.join(tempDir, `${cleanName}.wad.client`);
        packFolderToWad(full, targetWad);
        if (fs.existsSync(targetWad)) wadFiles.push(targetWad);
      }
    }
  }

  // 2. Look for root level .wad.client files
  if (!wadFiles.length) {
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const full = path.join(source, entry.name);
      if (entry.isFile() && (/\.wad\.client$/i.test(entry.name) || /\.wad$/i.test(entry.name))) {
        wadFiles.push(full);
      }
    }
  }

  // 3. Fallback recursive search
  if (!wadFiles.length) {
    const walk = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'META') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (/\.wad\.client$/i.test(entry.name) || /\.wad$/i.test(entry.name)) {
            const cleanName = entry.name.replace(/\.wad(?:\.client)?$/i, '');
            const targetWad = path.join(tempDir, `${cleanName}.wad.client`);
            packFolderToWad(full, targetWad);
            if (fs.existsSync(targetWad)) wadFiles.push(targetWad);
          } else {
            walk(full);
          }
        } else if (/\.wad\.client$/i.test(entry.name) || /\.wad$/i.test(entry.name)) {
          wadFiles.push(full);
        }
      }
    };
    walk(source);
  }

  // 4. Raw assets/data folder without WAD container
  if (!wadFiles.length) {
    const hasData = fs.existsSync(path.join(source, 'data')) || fs.existsSync(path.join(source, 'ASSETS'));
    if (hasData) {
      const targetWad = path.join(tempDir, `skin.wad.client`);
      packFolderToWad(source, targetWad);
      if (fs.existsSync(targetWad)) wadFiles.push(targetWad);
    }
  }

  return wadFiles;
}

function resolveTopazFixerPath() {
  const candidates = [
    path.join(getAppRoot(), 'tools', 'TopazModFixer.exe'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'tools', 'TopazModFixer.exe'),
    path.join(__dirname, 'tools', 'TopazModFixer.exe')
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

// Skyfixer paneline gelen bazı Windows/CLI çıktıları UTF-8 yerine ANSI gibi
// çözümlenebiliyor (ç, ö, …). Kullanıcıya göndermeden önce metni düzelt.
function repairSkyfixerText(value) {
  let text = String(value ?? '');
  const broken = /[ÃƒÆ’Ãƒâ€šÃƒâ€Ãƒâ€¦Ãƒâ€ ÃƒÃƒ¢Ã„Ã…]/;
  for (let i = 0; i < 3 && broken.test(text); i++) {
    try {
      const bytes = Uint8Array.from([...text].map(ch => ch.charCodeAt(0) & 255));
      const fixed = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      if (!fixed || fixed === text || fixed.includes('\uFFFD')) break;
      text = fixed;
    } catch (_) { break; }
  }
  return text.replace(/TopazModFixer/gi, 'Skyfixer').replace(/Topaz/gi, 'Skyfixer');
}

function runTopazFixer(executable, configPath, cwd, onLine) {
  return new Promise((resolve) => {
    const child = spawn(executable, [configPath], { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const read = chunk => {
      const text = repairSkyfixerText(chunk.toString());
      output += text;
      text.split(/\r?\n/).filter(Boolean).forEach(line => onLine?.(line));
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.on('error', error => resolve({ code: -1, output: `${output}\n${error.message}` }));
    child.on('close', code => resolve({ code: code ?? -1, output }));
  });
}

ipcMain.handle('run-topaz-skyfixer', async (event, skinPath) => {
  const progress = (step, pct, message) => event.sender.send('skyfixer-progress', { step, pct, message: repairSkyfixerText(message) });
  try {
    progress('validate', 5, 'Gerekli hash ve araçlar kontrol ediliyor...');
    await checkAndDownloadRequiredTools(msg => progress('validate', 10, msg));
    if (!skinPath || typeof skinPath !== 'string' || !fs.existsSync(skinPath)) throw new Error('Skin klasörü bulunamadı.');
    const source = path.resolve(skinPath);
    if (!fs.statSync(source).isDirectory()) throw new Error('Skin klasörü bulunamadı.');
    const fixer = resolveTopazFixerPath();
    if (!fixer) throw new Error('Skyfixer motoru bulunamadı.');
    
    const configDir = path.join(getUserDataDir(), 'skyfixer-config');
    const output = path.join(getUserDataDir(), `skyfixer-output-${Date.now()}`);
    const tempWadDir = path.join(getUserDataDir(), `skyfixer-wads-${Date.now()}`);
    const configPath = path.join(configDir, `fix-${Date.now()}.json`);
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(output, { recursive: true });
    fs.mkdirSync(tempWadDir, { recursive: true });

    progress('validate', 10, 'WAD dosyaları taranıyor ve hazırlanıyor...');
    const wadFiles = resolveOrPackWadFiles(source, tempWadDir);
    if (!wadFiles.length) throw new Error('Skin içinde .wad.client dosyası veya veri klasörü bulunamadı.');

    let character = null;
    if (wadFiles.length) {
      const match = path.basename(wadFiles[0]).match(/^([^./\\]+)\.wad(?:\.client)?$/i);
      if (match && match[1] && match[1].toLowerCase() !== 'skin') {
        character = match[1];
      }
    }
    if (!character) {
      const walkChar = dir => {
        if (!fs.existsSync(dir)) return null;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.isDirectory()) {
            if (e.name.toLowerCase() === 'characters' || e.name.toLowerCase() === 'character') {
              const sub = fs.readdirSync(path.join(dir, e.name)).filter(x => !x.includes('.'));
              if (sub.length) return sub[0];
            }
            const found = walkChar(path.join(dir, e.name));
            if (found) return found;
          }
        }
        return null;
      };
      character = walkChar(source);
    }
    if (!character) {
      character = path.basename(source).split(/\s+/)[0];
    }
    character = character.charAt(0).toUpperCase() + character.slice(1);

    const gameRoot = findGameDir();
    const gameFinal = path.join(gameRoot, 'DATA', 'FINAL');
    const hashPath = resolveRuntimeHashPath();
    const shaderPath = path.join(getAppRoot(), 'tools', 'hashes.shaders.txt');
    const manifestDownloader = path.join(getAppRoot(), 'tools', 'ManifestDownloader.exe');
    const manifestPath = path.join(getAppRoot(), 'tools', 'manifests.json');

    progress('backup', 15, 'Yedek hazırlanıyor...');
    const safeName = path.basename(source).replace(/[<>:"/\\|?*]/g, '_');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(getUserDataDir(), 'skyfixer-backups', `${safeName}-${stamp}`);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.cpSync(source, backup, { recursive: true });

    progress('prepare', 25, `${character} için Skyfixer ayarları hazırlanıyor...`);
    const config = {
      Character: character,
      BaseWadPath: wadFiles,
      SkinNo: 1,
      Output: output,
      Folder: true,
      GameWadPath: gameFinal,
      ...(hashPath ? { GameHashesPath: hashPath } : {}),
      ...(fs.existsSync(shaderPath) ? { ShaderHashesPath: shaderPath } : {}),
      ...(fs.existsSync(manifestPath) ? { Manifest_145: manifestPath } : {}),
      ...(fs.existsSync(manifestDownloader) ? { ManifestDownloaderPath: manifestDownloader } : {}),
      VerifyHpBar: true,
      InFilePath: true,
      ClsAssets: true,
      KeepIcons: true,
      KillStaticMat: true,
      SfxEvents: true,
      FixiShape: true,
      AllAviable: true,
      Binless: false,
      NoSkinni: false,
      SkipCheckup: false
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    progress('fix', 35, `${character} için Skyfixer motoru çalıştırılıyor...`);
    const result = await runTopazFixer(fixer, configPath, path.dirname(fixer), line => {
      event.sender.send('skyfixer-progress', { step: 'fix-log', pct: 55, message: repairSkyfixerText(line) });
    });
    if (result.code !== 0) throw new Error(`Skyfixer başarısız oldu (kod ${result.code}). ${result.output.slice(-500)}`);
    const outputEntries = fs.existsSync(output) ? fs.readdirSync(output) : [];
    if (!outputEntries.length) throw new Error('Skyfixer çıktı üretmedi.');
    progress('package', 86, 'Skyfixer çıktısı WAD/META skin formatına hazırlanıyor...');
    const stage = path.join(getUserDataDir(), `skyfixer-stage-${Date.now()}`);
    const stageMeta = path.join(stage, 'META');
    const stageWad = path.join(stage, 'WAD', path.basename(wadFiles[0]));
    fs.mkdirSync(stageWad, { recursive: true });
    if (fs.existsSync(path.join(backup, 'META'))) fs.cpSync(path.join(backup, 'META'), stageMeta, { recursive: true });
    else fs.mkdirSync(stageMeta, { recursive: true });
    for (const entry of outputEntries) fs.cpSync(path.join(output, entry), path.join(stageWad, entry), { recursive: true });
    fs.writeFileSync(path.join(stageMeta, 'details.json'), JSON.stringify({ Priority: 10, override_: false, InnerPath: '0', Random: false, Layers: [{ Name: 'base', Priority: 1, folder_name: 'WAD', is_active: false, Description: null }], layerss: 'None' }, null, 2));
    if (!fs.existsSync(path.join(stageMeta, 'info.json'))) fs.writeFileSync(path.join(stageMeta, 'info.json'), JSON.stringify({ Author: 'Skyfixer', Name: path.basename(source), Version: '1.0.0' }, null, 2));
    progress('replace', 93, 'Düzeltilmiş skin eski skinin yerine aktarılıyor...');
    for (const entry of fs.readdirSync(source)) fs.rmSync(path.join(source, entry), { recursive: true, force: true });
    for (const entry of fs.readdirSync(stage)) fs.cpSync(path.join(stage, entry), path.join(source, entry), { recursive: true });
    progress('archive', 97, 'Yeni duzeltilmis .fantome paketi olusturuluyor...');
    const fixedArchive = path.join(path.dirname(source), `${path.basename(source)}.fantome`);
    const staleArchives = [
      fixedArchive,
      path.join(getUserDataDir(), 'store-installed', `${path.basename(source)}.fantome`),
      path.join(getAppRoot(), 'installed', `${path.basename(source)}.fantome`)
    ];
    for (const staleArchive of [...new Set(staleArchives)]) {
      try { fs.rmSync(staleArchive, { force: true }); } catch (_) {}
    }
    const AdmZip = require('adm-zip');
    const fixedZip = new AdmZip();
    fixedZip.addLocalFolder(source);
    fixedZip.writeZip(fixedArchive);
    const fixTimestamp = new Date().toISOString();
    const report = { version: 3, mode: 'topaz-cli', source, backup, character, output: stage, fixedArchive, config, fixed: true, fixedAt: fixTimestamp };
    fs.writeFileSync(path.join(backup, 'skyfixer-report.json'), JSON.stringify(report, null, 2));
    try {
      fs.writeFileSync(path.join(source, 'skyfixer-info.json'), JSON.stringify({ fixed: true, fixedAt: fixTimestamp, version: '1.0.3', character }, null, 2));
    } catch (_) {}
    try { fs.rmSync(output, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(stage, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(tempWadDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(configPath, { force: true }); } catch (_) {}
    progress('complete', 100, 'Skyfixer tamamlandı: tüm seçili düzeltmeler uygulandı.');
    return { ok: true, report };
  } catch (error) {
    console.error('[Skyfixer] Motor hatası:', error);
    progress('error', 100, `Skyfixer başarısız: ${error.message}`);
    return { ok: false, error: error.message };
  }
});

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ SKYFIXER ONARIM DURUMU SORGULAYICI Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.handle('get-skyfixer-status', async (event, skinPath) => {
  try {
    if (!skinPath || typeof skinPath !== 'string' || !fs.existsSync(skinPath)) return { isFixed: false };
    const source = path.resolve(skinPath);
    const infoPath = path.join(source, 'skyfixer-info.json');
    if (fs.existsSync(infoPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
        return { isFixed: true, fixedAt: data.fixedAt, character: data.character };
      } catch (_) {}
    }
    // Also check if any backup exists in skyfixer-backups
    const safeName = path.basename(source).replace(/[<>:"/\\|?*]/g, '_');
    const backupsDir = path.join(getUserDataDir(), 'skyfixer-backups');
    if (fs.existsSync(backupsDir)) {
      const matching = fs.readdirSync(backupsDir).filter(b => b.startsWith(safeName));
      if (matching.length) {
        return { isFixed: true, backupCount: matching.length };
      }
    }
    return { isFixed: false };
  } catch (e) {
    return { isFixed: false };
  }
});


// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ MAÃƒâ€Ã‚AZA MOD DOSYASI Ãƒâ€Ã‚°NDÃƒâ€Ã‚°RÃƒâ€Ã‚°CÃƒâ€Ã‚° (ONLINE DISK SAVER) Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.handle('download-store-mod-file', async (event, data) => {
  const { downloadUrl, title } = data;
  const installedDir = path.join(getUserDataDir(), 'store-installed');
  if (!fs.existsSync(installedDir)) fs.mkdirSync(installedDir, { recursive: true });

  const cleanTitle = (title || 'mod').replace(/[^a-zA-Z0-9_\- ]/g, '_').trim();
  
  let ext = '.zip';
  if (downloadUrl) {
    if (downloadUrl.toLowerCase().includes('.fantome')) ext = '.fantome';
    else if (downloadUrl.toLowerCase().includes('.zip')) ext = '.zip';
  }

  const destPath = path.join(installedDir, `${cleanTitle}${ext}`);

  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1024) {
    console.log(`[StoreDownloader] Dosya zaten diskte mevcut: ${destPath}`);
    return destPath;
  }

  if (!downloadUrl) {
    console.warn(`[StoreDownloader] ${title} için indirme URL'si yok!`);
    return null;
  }

  console.log(`[StoreDownloader] ${title} indiriliyor -> ${downloadUrl}`);
  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 1024) throw new Error('Ãƒâ€Ã‚°ndirilen dosya boş veya geçersiz görünüyor.');
    // Uygulama import etmeye ÃƒÆ’Ã‚§alÃƒâ€Ã‚±Ãƒâ€¦Ã…¸Ãƒâ€Ã‚±rken yarÃƒâ€Ã‚±m dosya görmesin.
    const tempPath = `${destPath}.download-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tempPath, buffer);
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    fs.renameSync(tempPath, destPath);
    console.log(`[StoreDownloader] ${title} baÃƒâ€¦Ã…¸arÃƒâ€Ã‚±yla indirildi: ${destPath}`);
    return destPath;
  } catch (err) {
    console.error(`[StoreDownloader] Ãƒâ€Ã‚°ndirme hatasÃƒâ€Ã‚± (${title}):`, err.message);
    return null;
  }
});

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ VERÃƒâ€Ã‚°TABANI (SKYNIX DATABASE SKINS) KLASÖRÜ Ãƒâ€Ã‚°Ãƒâ€¦Ã‚LEMLERÃƒâ€Ã‚° Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.handle('select-db-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Skynix Data base Skins Klasörünü Seç'
  });
  return !result.canceled && result.filePaths.length > 0 ? result.filePaths[0] : null;
});

ipcMain.handle('auto-detect-db-folder', async () => {
  if (!cachedDbFolder) initDbFolder();
  return cachedDbFolder;
});

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ DERÃƒâ€Ã‚°NLEMESÃƒâ€Ã‚°NE REKÃƒÆ’Ã…â€œRSÃƒâ€Ã‚°F SKÃƒâ€Ã‚°N/CHROMA ZÃƒâ€Ã‚°P BULUCU Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
function findZipRecursively(dirPath, candidateTokens, validExts, maxDepth = 5) {
  if (!fs.existsSync(dirPath) || maxDepth <= 0) return null;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    // A) Önce mevcut klasördeki dosyalarÃƒâ€Ã‚± kontrol et
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (validExts.includes(ext)) {
          const baseName = path.basename(entry.name, ext).toLowerCase();
          for (const token of candidateTokens) {
            const cleanToken = String(token).toLowerCase();
            if (
              baseName === cleanToken ||
              baseName === cleanToken.padStart(2, '0') ||
              baseName === cleanToken.padStart(3, '0') ||
              baseName === cleanToken.padStart(4, '0') ||
              baseName.endsWith('_' + cleanToken) ||
              baseName.startsWith(cleanToken + '_') ||
              baseName.includes(cleanToken)
            ) {
              return path.join(dirPath, entry.name);
            }
          }
        }
      }
    }

    // B) Alt klasörleri tara (Aday numara içeren klasörlere öncelik ver: örn: "2044", "2045")
    const subDirs = entries.filter(e => e.isDirectory());
    subDirs.sort((a, b) => {
      const aMatch = candidateTokens.some(t => a.name === String(t) || a.name.includes(String(t)));
      const bMatch = candidateTokens.some(t => b.name === String(t) || b.name.includes(String(t)));
      return (bMatch ? 1 : 0) - (aMatch ? 1 : 0);
    });

    for (const subDir of subDirs) {
      const found = findZipRecursively(path.join(dirPath, subDir.name), candidateTokens, validExts, maxDepth - 1);
      if (found) return found;
    }
  } catch (e) {
    console.error('[DB] Rekürsif arama hatasÃƒâ€Ã‚±:', e);
  }
  return null;
}

ipcMain.handle('find-db-skin-file', async (event, data) => {
  let { champKey, champId, skinNum, skinName } = data;

  // "null" / "undefined" string korumasÃƒâ€Ã‚±
  if (!champKey || champKey === 'null' || champKey === 'undefined') champKey = null;
  if (!champId  || champId  === 'null' || champId  === 'undefined') champId  = null;
  if (skinNum === null || skinNum === undefined || skinNum === 'null') skinNum = 0;
  else skinNum = parseInt(skinNum, 10) || 0;

  if (!cachedDbFolder) initDbFolder();
  if (!cachedIndexData) await fetchOnlineIndexJson();
  const dbFolder = cachedDbFolder || data.dbFolder;

  const indexData = cachedIndexData;
  const validExts = ['.zip', '.fantome', '.wad.client', '.wad'];

  // Ãƒâ€¦Ã‚ampiyon klasör adaylarÃƒâ€Ã‚±: "238", "Zed" vb.
  const champDirs = dbFolder ? [
    champKey ? path.join(dbFolder, String(champKey)) : null,
    champId  ? path.join(dbFolder, champId) : null,
    champId  ? path.join(dbFolder, champId.toLowerCase()) : null,
    dbFolder
  ].filter(p => p && fs.existsSync(p)) : [];

  // Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ CHROMA ÃƒÆ’Ã¢â‚¬â€œNCELÃƒâ€Ã‚°KLÃƒâ€Ã‚° ARAMA (Chroma seÃƒÆ’Ã‚§ildiÃƒâ€Ã…¸inde ana skini döndürmeyi engeller) Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
  let chromaName = null;
  if (skinName && skinName.includes('(')) {
    const parts = skinName.split('(');
    chromaName = parts[1].replace(')', '').trim();
  }

  if (chromaName) {
    const cleanChroma = chromaName.toLowerCase();
    const chromaTokens = [
      skinName.toLowerCase(),
      cleanChroma,
      `${champId}_${skinNum}_${cleanChroma}`.toLowerCase(),
      `${champId}_${cleanChroma}`.toLowerCase()
    ];

    for (const dir of champDirs) {
      const chromaFile = findZipRecursively(dir, chromaTokens, validExts, 5);
      if (chromaFile && (chromaFile.toLowerCase().includes(cleanChroma) || chromaFile.toLowerCase().includes('chroma'))) {
        console.log(`[DB] Chroma Özel DosyasÃƒâ€Ã‚± BULUNDU: ${chromaFile}`);
        return chromaFile;
      }
    }
  }

  const candidateTokens = new Set();

  // index.json üzerinden eşleşen numaralarÃƒâ€Ã‚± al
  if (indexData && indexData.champions && champId) {
    const champEntry = indexData.champions[champId] ||
      Object.values(Object.fromEntries(
        Object.entries(indexData.champions).filter(([k]) =>
          k.toLowerCase() === champId.toLowerCase()
        )
      ))[0];

    if (champEntry) {
      if (champEntry.skins) {
        for (const [dbNum, dbName] of Object.entries(champEntry.skins)) {
          if (String(skinNum) === String(dbNum)) {
            candidateTokens.add(dbNum);
            if (champKey) candidateTokens.add(String(champKey) + String(dbNum).padStart(3, '0'));
          }
          if (skinName && dbName.toLowerCase() === skinName.toLowerCase()) {
            candidateTokens.add(dbNum);
            if (champKey) candidateTokens.add(String(champKey) + String(dbNum).padStart(3, '0'));
          }
        }
      }
      if (champEntry.chromas && skinName) {
        for (const chromaGroup of Object.values(champEntry.chromas)) {
          for (const [chromaNum, cName] of Object.entries(chromaGroup)) {
            if (cName.toLowerCase() === skinName.toLowerCase()) {
              candidateTokens.add(chromaNum);
              if (champKey) candidateTokens.add(String(champKey) + String(chromaNum).padStart(3, '0'));
            }
          }
        }
      }
    }
  }

  if (skinNum !== undefined && skinNum !== null) {
    candidateTokens.add(String(skinNum));
    if (champKey) candidateTokens.add(String(champKey) + String(skinNum).padStart(3, '0'));
  }

  if (skinName) {
    const cleanSkin = skinName.replace(/[^a-zA-Z0-9_\- ]/g, ' ').trim();
    candidateTokens.add(cleanSkin);
    const parts = skinName.split('(');
    if (parts.length > 1) {
      const baseTitle = parts[0].trim();
      const chromaTitle = parts[1].replace(')', '').trim();
      candidateTokens.add(baseTitle);
      candidateTokens.add(chromaTitle);
      candidateTokens.add(baseTitle.toLowerCase());
      candidateTokens.add(chromaTitle.toLowerCase());
    }
  }

  const tokenList = [...candidateTokens];
  console.log(`[DB] ${champId} / "${skinName}" için aranan tokenlar:`, tokenList);

  for (const dir of champDirs) {
    const foundFile = findZipRecursively(dir, tokenList, validExts, 5);
    if (foundFile) {
      console.log(`[DB] Rekürsif Arama BULDU: ${foundFile}`);
      return foundFile;
    }
  }

  // Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ GITHUB OTOMATÃƒâ€Ã‚°K SKÃƒâ€Ã‚°N DOWNLOADER FALLBACK Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
  // Format: raw.githubusercontent.com/.../main/{champKey}/{champKey}{numPadded3}.zip
  // Örnek: /517/517001.zip (Ãƒâ€¦Ã‚ampiyon 517, Skin 1)
  if (champKey && skinNum !== undefined) {
    // Champion kütüphanesinden otomatik indirilen paketleri özel skinlerden
    // ayrı tut. Böylece installed/ yalnızca kullanıcının özel modları için kalır.
    const championDefaultsDir = path.join(getUserDataDir(), 'champion-defaults');
    if (!fs.existsSync(championDefaultsDir)) fs.mkdirSync(championDefaultsDir, { recursive: true });

    const RAW_BASE = 'https://raw.githubusercontent.com/Herobrine-2/skynix-database/main/Skins';
    
    // Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ DoÃƒâ€Ã…¸ru Skin NumarasÃƒâ€Ã‚±nÃƒâ€Ã‚± Bul Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
    // index.json'dan bu skin/chroma için gerçek numarayÃƒâ€Ã‚± al
    let resolvedNum = skinNum;
    let parentSkinNum = null;
    
  // index.json üzerinden chroma numarasÃƒâ€Ã‚±nÃƒâ€Ã‚± resolve et
  if (indexData && indexData.champions) {
    // champId ile ya da champKey üzerinden champion entry bul
    let champEntry = null;
    if (champId) {
      champEntry = indexData.champions[champId] ||
        Object.values(indexData.champions).find((_, i) =>
          Object.keys(indexData.champions)[i].toLowerCase() === champId.toLowerCase()
        );
    }
    // champId ile bulunamadÃƒâ€Ã‚±ysa champKey'e göre ara (bazÃƒâ€Ã‚± kayÃƒâ€Ã‚±tlarda key sayÃƒâ€Ã‚±sal olabilir)
    if (!champEntry && champKey) {
      champEntry = Object.values(indexData.champions).find((entry, i) => {
        const k = Object.keys(indexData.champions)[i];
        return k === String(champKey);
      });
    }

    if (champEntry) {
      // Chroma ise Ãƒ¢Ã¢â‚¬ ’ chromas objesinden doÃƒâ€Ã…¸ru numarayÃƒâ€Ã‚± bul
      if (chromaName && champEntry.chromas) {
        outer:
        for (const [pNum, chromaGroup] of Object.entries(champEntry.chromas)) {
          // Aynı renk adı farklı ana skinlerde bulunabilir; doğru ana skin
          // grubunun dışına çıkma.
          if (Number(pNum) !== Number(skinNum)) continue;
          for (const [cNum, cName] of Object.entries(chromaGroup)) {
            if (cName.toLowerCase() === skinName.toLowerCase() ||
                cName.toLowerCase().includes(chromaName.toLowerCase())) {
              resolvedNum = parseInt(cNum);
              parentSkinNum = parseInt(pNum);
              break outer;
            }
          }
        }
      }
      // Normal skin ise Ãƒ¢Ã¢â‚¬ ’ skins objesinden doÃƒâ€Ã…¸rula
      else if (champEntry.skins) {
        for (const [dbNum, dbName] of Object.entries(champEntry.skins)) {
          if (String(skinNum) === String(dbNum) ||
              (skinName && dbName.toLowerCase() === skinName.toLowerCase())) {
            resolvedNum = parseInt(dbNum);
            break;
          }
        }
      }
    }
  }
    // Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ Dosya AdÃƒâ€Ã‚±nÃƒâ€Ã‚± Oluştur: {champKey}{num 3 haneli}.zip Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
    const numPadded = String(resolvedNum).padStart(3, '0');
    const fileName = `${champKey}${numPadded}.zip`;
    const fileKey = fileName.replace(/\.zip$/i, '');
    const fileUrls = [
      `${RAW_BASE}/${champKey}/${fileKey}/${fileName}`,
      `${RAW_BASE}/${champKey}/${fileName}`
    ];
    if (parentSkinNum !== null && !Number.isNaN(parentSkinNum)) {
      const parentKey = `${champKey}${String(parentSkinNum).padStart(3, '0')}`;
      fileUrls.unshift(`${RAW_BASE}/${champKey}/${parentKey}/${fileKey}/${fileName}`);
    }
    const localPath = path.join(championDefaultsDir, fileName);

    // Önce local cache'e bak
    if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
      console.log(`[DB-AutoDownloader] Cache'de bulundu: ${localPath}`);
      return localPath;
    }

    // GitHub'dan direkt indir
    try {
      for (const fileUrl of fileUrls) {
        console.log(`[DB-AutoDownloader] Ãƒâ€Ã‚°ndiriliyor: ${fileUrl}`);
        const res = await fetch(fileUrl);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          fs.writeFileSync(localPath, Buffer.from(buffer));
          console.log(`[DB-AutoDownloader] Ãƒâ€Ã‚°ndirildi Ãƒ¢Ã¢â‚¬ ’ ${localPath}`);
          return localPath;
        }
        console.warn(`[DB-AutoDownloader] ${fileUrl} Ãƒ¢Ã¢â‚¬ ’ HTTP ${res.status}`);
      }
    } catch (fetchErr) {
      console.warn(`[DB-AutoDownloader] Fetch hatasÃƒâ€Ã‚±: ${fetchErr.message}`);
    }

    // Alternatif: .fantome uzantÃƒâ€Ã‚±sÃƒâ€Ã‚± dene
    const fantomeName = `${champKey}${numPadded}.fantome`;
    const fantomeUrl = `${RAW_BASE}/${champKey}/${fantomeName}`;
    const fantomePath = path.join(championDefaultsDir, fantomeName);

    if (fs.existsSync(fantomePath) && fs.statSync(fantomePath).size > 0) {
      return fantomePath;
    }

    try {
      const res2 = await fetch(fantomeUrl);
      if (res2.ok) {
        const buffer2 = await res2.arrayBuffer();
        fs.writeFileSync(fantomePath, Buffer.from(buffer2));
        console.log(`[DB-AutoDownloader] .fantome indirildi Ãƒ¢Ã¢â‚¬ ’ ${fantomePath}`);
        return fantomePath;
      }
    } catch (e2) {
      // sessizce devam et
    }
  }

  console.warn(`[DB] ${champId} / "${skinName}" için yerel diskte veya GitHub'da uygun dosya bulunamadÃƒâ€Ã‚±.`);
  return null;
});

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ GITHUB SKYNIX DATABASE SYNC (RAR Ãƒâ€Ã‚°NDÃƒâ€Ã‚°R + AÇ) Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.handle('sync-db-from-github', async (event) => {
  try {
    // 1. GitHub API'den release asset listesini çek
    event.sender.send('sync-db-progress', { step: 'api', pct: 5, msg: 'GitHub\'dan sürüm bilgileri alÃƒâ€Ã‚±nÃƒâ€Ã‚±yor...' });
    const apiUrl = 'https://api.github.com/repos/Herobrine-2/skynix-database/releases';
    const apiRes = await fetch(apiUrl, {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Skynix-Manager' }
    });
    if (!apiRes.ok) throw new Error(`GitHub API hatasÃƒâ€Ã‚±: ${apiRes.status}`);
    const releases = await apiRes.json();

    // 2. Ãƒâ€Ã‚°lk release'deki RAR veya ZIP asset'ini bul
    let rarAsset = null;
    let zipAsset = null;
    for (const release of releases) {
      for (const asset of (release.assets || [])) {
        const name = asset.name.toLowerCase();
        if (name.endsWith('.rar') && !rarAsset) rarAsset = asset;
        if (name.endsWith('.zip') && !zipAsset) zipAsset = asset;
      }
      if (rarAsset || zipAsset) break;
    }

    const targetAsset = rarAsset || zipAsset;
    if (!targetAsset) throw new Error('GitHub release\'de uygun skin dosyasÃƒâ€Ã‚± bulunamadÃƒâ€Ã‚±!');

    // 3. DosyayÃƒâ€Ã‚± indir
    const isRar = targetAsset.name.toLowerCase().endsWith('.rar');
    const tmpDir = os.tmpdir();
    const tmpFilePath = path.join(tmpDir, targetAsset.name);
    event.sender.send('sync-db-progress', { step: 'download', pct: 10, msg: `Ãƒâ€Ã‚°ndiriliyor: ${targetAsset.name} (${Math.round(targetAsset.size / 1024 / 1024)}MB)...` });

    const dlRes = await fetch(targetAsset.browser_download_url, { headers: { 'User-Agent': 'Skynix-Manager' } });
    if (!dlRes.ok) throw new Error(`Dosya indirilemedi: ${dlRes.status}`);

    const totalSize = targetAsset.size;
    const reader = dlRes.body.getReader();
    let downloaded = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      downloaded += value.length;
      const pct = Math.round(10 + (downloaded / totalSize) * 60);
      event.sender.send('sync-db-progress', { step: 'download', pct, msg: `Ãƒâ€Ã‚°ndiriliyor... %${Math.round(downloaded/totalSize*100)}` });
    }
    const fileBuffer = Buffer.concat(chunks);
    fs.writeFileSync(tmpFilePath, fileBuffer);
    event.sender.send('sync-db-progress', { step: 'extract', pct: 72, msg: 'Dosya aÃƒÆ’Ã‚§Ãƒâ€Ã‚±lÃƒâ€Ã‚±yor...' });

    // 4. Hedef klasörü hazÃƒâ€Ã‚±rla
    const destDir = path.join(getAppRoot(), 'Skynix Data base Skins');
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    if (isRar) {
      // node-unrar-js ile aç
      const { createExtractorFromData } = require('node-unrar-js');
      const extractor = await createExtractorFromData({ data: Uint8Array.from(fileBuffer) });
      const { files } = extractor.extract();
      let count = 0;
      for (const file of files) {
        if (file.fileHeader.flags.directory) continue;
        const outPath = path.join(destDir, file.fileHeader.name.replace(/\\/g, '/'));
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, Buffer.from(file.extraction));
        count++;
        if (count % 5 === 0) {
          const pct = Math.min(95, 72 + Math.round(count / 100 * 20));
          event.sender.send('sync-db-progress', { step: 'extract', pct, msg: `AÃƒÆ’Ã‚§Ãƒâ€Ã‚±lÃƒâ€Ã‚±yor: ${count} dosya...` });
        }
      }
    } else {
      // adm-zip ile aç
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(tmpFilePath);
      zip.extractAllTo(destDir, true);
    }

    // 5. Temizle ve cachedDbFolder güncelle
    try { fs.unlinkSync(tmpFilePath); } catch (_) {}
    cachedDbFolder = destDir;
    event.sender.send('sync-db-progress', { step: 'done', pct: 100, msg: 'Senkronizasyon tamamlandÃƒâ€Ã‚±! ✅' });
    return { success: true, path: destDir };
  } catch (err) {
    console.error('[SyncDB] Hata:', err);
    event.sender.send('sync-db-progress', { step: 'error', pct: 0, msg: `Hata: ${err.message}` });
    return { success: false, error: err.message };
  }
});

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ OTOMATÃƒâ€Ã‚°K LOL TESPÃƒâ€Ã‚°TÃƒâ€Ã‚° Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.handle('auto-detect-lol', async () => {
  const knownExes = [
    'C:\\Riot Games\\League of Legends\\LeagueClient.exe',
    'D:\\Riot Games\\League of Legends\\LeagueClient.exe',
    'E:\\Riot Games\\League of Legends\\LeagueClient.exe',
    'W:\\Riot Games\\League of Legends\\LeagueClient.exe',
  ];
  for (const p of knownExes) {
    if (fs.existsSync(p)) return p;
  }
  return null;
});

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ INSTALLED KLASÖRÜNÜ TARA Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.handle('scan-installed-skins', async () => {
  const installedDir = path.join(getUserDataDir(), 'installed');
  if (!fs.existsSync(installedDir)) {
    fs.mkdirSync(installedDir, { recursive: true });
    return [];
  }
  const entries = fs.readdirSync(installedDir, { withFileTypes: true });
  // Sadece klasörleri döndür (cslol formatÃƒâ€Ã‚±: META/WAD yapÃƒâ€Ã‚±sÃƒâ€Ã‚±)
  return entries
    .map(f => ({
      title: f.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
      champ: 'Yüklü Mod',
      path: path.join(installedDir, f.name),
      file: f.name,
      isDirectory: f.isDirectory()
    }));
});

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ OTOMATÃƒâ€Ã‚°K WAD/META DÃƒÆ’Ã¢â‚¬â€œNÃƒÆ’Ã…â€œÃƒâ€¦Ã‚TÃƒÆ’Ã…â€œRÃƒÆ’Ã…â€œCÃƒÆ’Ã…â€œ (HAM ASSET KLASÃƒÆ’Ã¢â‚¬â€œRLERÃƒâ€Ã‚°NÃƒâ€Ã‚° WAD FORMATINA ÃƒÆ’Ã¢â‚¬¡EVÃƒâ€Ã‚°RÃƒâ€Ã‚°R) Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
async function ensureWadStructure(modFolderPath, gameDir, cliPath) {
  if (!modFolderPath || !fs.existsSync(modFolderPath) || !fs.statSync(modFolderPath).isDirectory()) return false;

  const metaDir = path.join(modFolderPath, 'META');
  const wadDir = path.join(modFolderPath, 'WAD');

  // 1) EÃƒâ€Ã…¸er WAD/ klasörü zaten var ve içinde en az bir .wad / .client dosyasÃƒâ€Ã‚± varsa
  if (fs.existsSync(wadDir)) {
    try {
      const wadFiles = fs.readdirSync(wadDir).filter(f => f.endsWith('.wad') || f.endsWith('.client') || f.includes('.wad.'));
      if (wadFiles.length > 0) {
        for (const wf of wadFiles) {
          if (wf.endsWith('.wad') && !wf.endsWith('.wad.client')) {
            const oldP = path.join(wadDir, wf);
            const newP = path.join(wadDir, wf + '.client');
            try { fs.renameSync(oldP, newP); } catch (_) {}
          }
        }
        if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
        if (!fs.existsSync(path.join(metaDir, 'info.json'))) {
          fs.writeFileSync(path.join(metaDir, 'info.json'), JSON.stringify({ author: "Herobrine", name: path.basename(modFolderPath), version: "1.0.0" }, null, 2));
        }
        return true;
      }
    } catch (_) {}
  }

  // 2) Klasörün HERHANGÃƒâ€Ã‚° BÃƒâ€Ã‚°R YERÃƒâ€Ã‚°NDE (kök veya alt klasörlerde) hazÃƒâ€Ã‚±r .wad / .client dosyasÃƒâ€Ã‚± varsa WAD/ içine topla
  const findWadFilesRecursively = (dir) => {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'WAD' && entry.name !== 'META') {
            results = results.concat(findWadFilesRecursively(fullPath));
          }
        } else {
          const lName = entry.name.toLowerCase();
          if (lName.endsWith('.wad') || lName.endsWith('.client') || lName.includes('.wad.')) {
            results.push(fullPath);
          }
        }
      }
    } catch (_) {}
    return results;
  };

  const foundWadFiles = findWadFilesRecursively(modFolderPath);
  if (foundWadFiles.length > 0) {
    if (!fs.existsSync(wadDir)) fs.mkdirSync(wadDir, { recursive: true });
    if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });

    for (const wFile of foundWadFiles) {
      const bName = path.basename(wFile);
      const targetName = bName.endsWith('.client') ? bName : `${bName}.client`;
      const targetPath = path.join(wadDir, targetName);
      if (wFile !== targetPath) {
        try { fs.copyFileSync(wFile, targetPath); } catch (_) {}
      }
    }
    if (!fs.existsSync(path.join(metaDir, 'info.json'))) {
      fs.writeFileSync(path.join(metaDir, 'info.json'), JSON.stringify({ author: "Herobrine", name: path.basename(modFolderPath), version: "1.0.0" }, null, 2));
    }
    return true;
  }

  // 3) EÃƒâ€Ã‚ER HÃƒâ€Ã‚°ÃƒÆ’Ã¢â‚¬¡ WAD DOSYASI YOKSA (HAM ASSET/DATA KLASÖRÜ):
  // mod-tools.exe import komutunu kullanarak ham assets dosyalarÃƒâ€Ã‚±nÃƒâ€Ã‚± otomatik WAD arşivine çevir!
  if (cliPath && fs.existsSync(cliPath)) {
    const tempOutputDir = path.join(getUserDataDir(), 'temp_compiled_wad_' + Date.now());
    fs.mkdirSync(tempOutputDir, { recursive: true });
    const toolsDir = path.dirname(cliPath);

    const importCmd = `"${cliPath}" import "${modFolderPath}" "${tempOutputDir}" --game:"${gameDir}" --noTFT`;
    const importOk = await new Promise((resolve) => {
      require('child_process').exec(importCmd, { cwd: toolsDir, windowsHide: true, timeout: 45000 }, (err) => {
        resolve(!err);
      });
    });

    if (importOk && fs.existsSync(path.join(tempOutputDir, 'WAD'))) {
      const tempWad = path.join(tempOutputDir, 'WAD');
      const tempMeta = path.join(tempOutputDir, 'META');
      if (fs.existsSync(tempWad)) {
        if (!fs.existsSync(wadDir)) fs.mkdirSync(wadDir, { recursive: true });
        fs.cpSync(tempWad, wadDir, { recursive: true });
      }
      if (fs.existsSync(tempMeta)) {
        if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
        fs.cpSync(tempMeta, metaDir, { recursive: true });
      }
      try { fs.rmSync(tempOutputDir, { recursive: true, force: true }); } catch (_) {}
      return true;
    }
    try { fs.rmSync(tempOutputDir, { recursive: true, force: true }); } catch (_) {}
  }

  // Fallback META & WAD garantile
  if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
  if (!fs.existsSync(wadDir)) fs.mkdirSync(wadDir, { recursive: true });
  if (!fs.existsSync(path.join(metaDir, 'info.json'))) {
    fs.writeFileSync(path.join(metaDir, 'info.json'), JSON.stringify({ author: "Herobrine", name: path.basename(modFolderPath), version: "1.0.0" }, null, 2));
  }
  return false;
}

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ SKIN DOSYASI VEYA KLASÖRÜNÜ INSTALLED'A Ãƒâ€Ã‚°ÃƒÆ’Ã¢â‚¬¡E AKTAR Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.handle('import-skin-to-installed', async (event, sourcePath) => {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return { success: false, message: 'Kaynak dosya/klasör bulunamadÃƒâ€Ã‚±: ' + sourcePath };
  }

  const primaryInstalledDir = path.join(getUserDataDir(), 'installed');
  if (!fs.existsSync(primaryInstalledDir)) fs.mkdirSync(primaryInstalledDir, { recursive: true });

  const rawName = path.basename(sourcePath);
  const cleanName = rawName.replace(/\.(fantome|zip|rar|7z|raw|wad|client)$/i, '').replace(/_/g, ' ').trim() || rawName;
  const targetDest = path.join(primaryInstalledDir, cleanName);

  // Keep one canonical copy. Mirroring large skins into legacy folders caused
  // long freezes and multiplied disk/network I/O.
  const candidateInstalledDirs = [primaryInstalledDir];

  try {
    const stat = fs.statSync(sourcePath);

    // =========================================================================
    // A) EÃƒâ€Ã‚ER GELEN BÃƒâ€Ã‚°R KLASÖR Ãƒâ€Ã‚°SE (DIRECTORY)
    // =========================================================================
    if (stat.isDirectory()) {
      if (sourcePath !== targetDest && !sourcePath.startsWith(primaryInstalledDir + path.sep)) {
        if (fs.existsSync(targetDest)) {
          fs.rmSync(targetDest, { recursive: true, force: true });
        }
        await fs.promises.cp(sourcePath, targetDest, { recursive: true });
      }

      // Tekli iç içe klasör varsa ÃƒÆ’Ã‚§Ãƒâ€Ã‚±kar
      try {
        let items = fs.readdirSync(targetDest);
        if (items.length === 1 && fs.statSync(path.join(targetDest, items[0])).isDirectory() && items[0] !== 'META' && items[0] !== 'WAD') {
          const innerDir = path.join(targetDest, items[0]);
          const innerItems = fs.readdirSync(innerDir);
          for (const innerItem of innerItems) {
            fs.renameSync(path.join(innerDir, innerItem), path.join(targetDest, innerItem));
          }
          fs.rmdirSync(innerDir);
        }
      } catch (_) {}

    // =========================================================================
    // B) EÃƒâ€Ã‚ER GELEN BÃƒâ€Ã‚°R DOSYA Ãƒâ€Ã‚°SE (FILE)
    // =========================================================================
    } else {
      const ext = path.extname(sourcePath).toLowerCase();
      let cliPath = resolveModToolsPath();

      let gameDir = 'C:\\Riot Games\\League of Legends\\game';
      if (!fs.existsSync(gameDir)) {
        const known = ['D:\\Riot Games\\League of Legends\\game', 'E:\\Riot Games\\League of Legends\\game', 'W:\\Riot Games\\League of Legends\\game'];
        const found = known.find(k => fs.existsSync(k));
        if (found) gameDir = found;
      }

      // 1) Tek .wad / .client dosyasÃƒâ€Ã‚±
      if (ext === '.wad' || ext === '.client' || rawName.endsWith('.wad.client')) {
        if (!fs.existsSync(targetDest)) fs.mkdirSync(targetDest, { recursive: true });
        const metaDir = path.join(targetDest, 'META');
        const wadDir = path.join(targetDest, 'WAD');
        if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
        if (!fs.existsSync(wadDir)) fs.mkdirSync(wadDir, { recursive: true });

        fs.writeFileSync(path.join(metaDir, 'info.json'), JSON.stringify({ author: "Skynix", name: cleanName, version: "1.0.0" }, null, 2));
        const clientFileName = rawName.endsWith('.client') ? rawName : `${cleanName}.wad.client`;
        fs.copyFileSync(sourcePath, path.join(wadDir, clientFileName));

      // 2) RAR veya 7Z arşivi
      } else if (ext === '.rar' || ext === '.7z') {
        const tempExtractDir = path.join(getUserDataDir(), 'temp_skin_extract_' + Date.now());
        fs.mkdirSync(tempExtractDir, { recursive: true });
        if (ext === '.rar') {
          try {
            const { createExtractorFromFile } = require('node-unrar-js');
            const extractor = await createExtractorFromFile({ filepath: sourcePath });
            const { files } = extractor.extract();
            for (const file of files) {
              if (file.fileHeader.flags.directory) continue;
              const outPath = path.join(tempExtractDir, file.fileHeader.name.replace(/\\/g, '/'));
              fs.mkdirSync(path.dirname(outPath), { recursive: true });
              fs.writeFileSync(outPath, Buffer.from(file.extraction));
            }
          } catch (rarErr) {
            console.warn('[Import] RAR hatasÃƒâ€Ã‚±:', rarErr.message);
          }
        }
        if (fs.existsSync(targetDest)) fs.rmSync(targetDest, { recursive: true, force: true });
        await fs.promises.cp(tempExtractDir, targetDest, { recursive: true });
        try { fs.rmSync(tempExtractDir, { recursive: true, force: true }); } catch (_) {}

      // 3) FANTOME veya ZIP arşivi
      } else {
        let modToolsSuccess = false;
        if (fs.existsSync(cliPath)) {
          if (fs.existsSync(targetDest)) fs.rmSync(targetDest, { recursive: true, force: true });
          fs.mkdirSync(targetDest, { recursive: true });
          const toolsDir = path.dirname(cliPath);
          const importCmd = `"${cliPath}" import "${sourcePath}" "${targetDest}" --game:"${gameDir}" --noTFT`;
          modToolsSuccess = await new Promise((resolve) => {
            require('child_process').exec(importCmd, { cwd: toolsDir, windowsHide: true, timeout: 30000 }, (err) => {
              resolve(!err);
            });
          });
        }

        if (!modToolsSuccess) {
          if (fs.existsSync(targetDest)) fs.rmSync(targetDest, { recursive: true, force: true });
          fs.mkdirSync(targetDest, { recursive: true });
          const AdmZip = require('adm-zip');
          try {
            const zip = new AdmZip(sourcePath);
            zip.extractAllTo(targetDest, true);
          } catch (zipErr) {
            fs.copyFileSync(sourcePath, path.join(targetDest, rawName));
          }
        }
      }
    }

    // =========================================================================
    // C) HER DURUMDA OTOMATÃƒâ€Ã‚°K WAD/META DÃƒÆ’Ã¢â‚¬â€œNÃƒÆ’Ã…â€œÃƒâ€¦Ã‚TÃƒÆ’Ã…â€œRÃƒÆ’Ã…â€œCÃƒÆ’Ã…â€œYÃƒÆ’Ã…â€œ ÃƒÆ’Ã¢â‚¬¡ALIÃƒâ€¦Ã‚TIR
    // =========================================================================
    if (fs.existsSync(targetDest)) {
      let cliPath = resolveModToolsPath();

      let gameDir = 'C:\\Riot Games\\League of Legends\\game';
      if (!fs.existsSync(gameDir)) {
        const known = ['D:\\Riot Games\\League of Legends\\game', 'E:\\Riot Games\\League of Legends\\game', 'W:\\Riot Games\\League of Legends\\game'];
        const found = known.find(k => fs.existsSync(k));
        if (found) gameDir = found;
      }

      await ensureWadStructure(targetDest, gameDir, cliPath);
    }

    return { success: true, path: targetDest };
  } catch (e) {
    console.error('[ImportSkin] Hata:', e);
    return { success: false, message: e.message };
  }
});

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ SKIN KLASÖRÜNDEN Ãƒâ€¦Ã‚AMPÃƒâ€Ã‚°YON TESPÃƒâ€Ã‚°TÃƒâ€Ã‚° (WAD & META DOKUMASI) Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.handle('detect-skin-champ', async (event, skinPath) => {
  try {
    if (!skinPath) return null;

    let targetDir = skinPath;
    if (fs.existsSync(skinPath) && fs.statSync(skinPath).isFile()) {
      const cleanName = path.basename(skinPath).replace(/\.(fantome|zip|rar|7z|raw|wad|client)$/i, '').replace(/_/g, ' ').trim();
      targetDir = path.join(getUserDataDir(), 'installed', cleanName);
    }

    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) return null;

    // 1) WAD klasörünün içindeki .wad.client dosyalarÃƒâ€Ã‚±ndan şampiyon ismi oku
    const wadDir = path.join(targetDir, 'WAD');
    if (fs.existsSync(wadDir)) {
      const wadFiles = fs.readdirSync(wadDir);
      for (const w of wadFiles) {
        const cleanWad = w.replace(/\.wad\.client$/i, '').replace(/\.client$/i, '').replace(/\.wad$/i, '').trim();
        if (cleanWad && cleanWad.length >= 2) {
          return { champId: cleanWad, champName: cleanWad };
        }
      }
    }

    // 2) META/info.json dosyasÃƒâ€Ã‚±nÃƒâ€Ã‚± incele
    const metaInfo = path.join(targetDir, 'META', 'info.json');
    if (fs.existsSync(metaInfo)) {
      try {
        const info = JSON.parse(fs.readFileSync(metaInfo, 'utf-8'));
        if (info.champ || info.champion) {
          return { champId: info.champ || info.champion, champName: info.champ || info.champion };
        }
      } catch (_) {}
    }

    return null;
  } catch (e) {
    return null;
  }
});


// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ INSTALLED TÜMÜNÜ SIFIRLA IPC Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.handle('clear-installed-skins', async () => {
  try {
    // Skin paketleri yalnızca installed/ altında tutulmuyor. Skyfixer'ın
    // yedekleri ve overlay çalışma alanı da aynı temizleme düğmesinin parçası
    // olmalı; aksi halde kullanıcı sildiği skinin dosyalarını diskte görmeye
    // devam eder.
    const targetDirs = [
      path.join(getUserDataDir(), 'installed'),
      path.join(getUserDataDir(), 'store-installed'),
      path.join(getUserDataDir(), 'skyfixer-backups'),
      path.join(getUserDataDir(), 'selected-overlay-mods'),
      path.join(getUserDataDir(), 'champion-defaults'),
      path.join(getUserDataDir(), 'temp_skin_extract'),
      path.join(getAppRoot(), 'installed'),
      'W:\\Custom Skins Program\\cslol-manager\\installed'
    ];

    let count = 0;
    for (const installedDir of targetDirs) {
      if (!fs.existsSync(installedDir)) continue;
      const files = fs.readdirSync(installedDir);
      for (const f of files) {
        const fullPath = path.join(installedDir, f);
        fs.rmSync(fullPath, { recursive: true, force: true });
        count++;
      }
    }

    // Arşiv açma sırasında oluşturulan zaman damgalı geçici skin klasörleri.
    try {
      const userDir = getUserDataDir();
      if (fs.existsSync(userDir)) {
        for (const entry of fs.readdirSync(userDir)) {
          if (/^temp_skin_extract[_-]/i.test(entry)) {
            fs.rmSync(path.join(userDir, entry), { recursive: true, force: true });
            count++;
          }
        }
      }
    } catch (_) {}
    return { success: true, count };
  } catch (e) {
    console.error("Skin sÃƒâ€Ã‚±fÃƒâ€Ã‚±rlama hatasÃƒâ€Ã‚±:", e);
    return { success: false, message: e.message };
  }
});

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ INSTALLED SÃƒâ€Ã‚°LÃƒâ€Ã‚°CÃƒâ€Ã‚° IPC (TAM TEMÃƒâ€Ã‚°ZLÃƒâ€Ã‚°K) Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.handle('delete-installed-skin', async (event, skinPath) => {
  try {
    let cleanName = '';
    if (skinPath) {
      cleanName = path.basename(skinPath).replace(/\.(fantome|zip|rar|7z|raw|wad|client)$/i, '').replace(/_/g, ' ').trim();
    }

    const targetDirs = [
      path.join(getUserDataDir(), 'installed'),
      path.join(getUserDataDir(), 'store-installed'),
      path.join(getUserDataDir(), 'selected-overlay-mods'),
      path.join(getUserDataDir(), 'champion-defaults'),
      path.join(getAppRoot(), 'installed'),
      'W:\\Custom Skins Program\\cslol-manager\\installed',
      path.join(getAppRoot(), '..', 'Skynix Manager', 'installed')
    ];

    let deleted = false;

    // 1) DoÃƒâ€Ã…¸rudan gelen yoldaki dosya/klasörü sil
    if (skinPath && fs.existsSync(skinPath)) {
      const stat = fs.statSync(skinPath);
      if (stat.isDirectory()) {
        fs.rmSync(skinPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(skinPath);
      }
      deleted = true;
    }

    // 2) Tüm installed dizinlerinde eşleşen isimdeki klasör ve dosyalarÃƒâ€Ã‚± tamamen temizle
    if (cleanName) {
      const normalizedName = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '');
      for (const dir of targetDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
          const items = fs.readdirSync(dir);
          for (const item of items) {
            const itemClean = item.replace(/\.(fantome|zip|rar|7z|raw|wad|client)$/i, '').replace(/_/g, ' ').trim();
            const normalizedItem = itemClean.toLowerCase().replace(/[^a-z0-9]+/g, '');
            if (itemClean.toLowerCase() === cleanName.toLowerCase() || normalizedItem === normalizedName) {
              const fullItemPath = path.join(dir, item);
              if (fs.existsSync(fullItemPath)) {
                const stat = fs.statSync(fullItemPath);
                if (stat.isDirectory()) {
                  fs.rmSync(fullItemPath, { recursive: true, force: true });
                } else {
                  fs.unlinkSync(fullItemPath);
                }
                deleted = true;
              }
            }
          }
        } catch (_) {}
      }

      // Skyfixer yedekleri isim sonuna zaman damgası ekler. Skin silindiğinde
      // bu yedeklerin de aynı skinle birlikte kaldırılması gerekir.
      const backupsDir = path.join(getUserDataDir(), 'skyfixer-backups');
      if (fs.existsSync(backupsDir)) {
        try {
          for (const item of fs.readdirSync(backupsDir)) {
            const normalizedItem = item.toLowerCase().replace(/[^a-z0-9]+/g, '');
            if (normalizedItem === normalizedName || normalizedItem.startsWith(normalizedName)) {
              fs.rmSync(path.join(backupsDir, item), { recursive: true, force: true });
              deleted = true;
            }
          }
        } catch (_) {}
      }
    }

    return deleted;
  } catch (e) {
    console.error("Dosya/Klasör silme hatasÃƒâ€Ã‚±:", e);
    return false;
  }
});



// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ SKÃƒâ€Ã‚°NLERÃƒâ€Ã‚° DURDURMA IPC Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.handle('stop-cslol-skin', async () => {
  overlayOperationInProgress = false;
  stopActiveModProcess();
  return { success: true };
});

// Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬ CANLI LOGLU VE GÃƒÆ’Ã…â€œVENLÃƒâ€Ã‚° MOD MOTORU Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬Ãƒ¢Ã¢â‚¬Ã¢â€š¬
ipcMain.handle('run-cslol-skin', async (event, data) => {
  if (overlayOperationInProgress) {
    return { success: false, busy: true, message: 'Skin işlemi zaten devam ediyor.' };
  }
  overlayOperationInProgress = true;
  return new Promise(async (resolve) => {
    const finish = (result) => { overlayOperationInProgress = false; resolve(result); };
    const { skinPath, lolExePath } = data;

    const sendLog = (msg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('cslol-log', msg);
      }
    };

    sendLog(`[START] Skin path: ${path.basename(skinPath)}`);

    let cliPath = resolveModToolsPath();

    if (!fs.existsSync(cliPath)) {
      sendLog('[ERROR] tools/mod-tools.exe engine not found.');
      finish({ success: false, message: 'tools/mod-tools.exe engine not found.' });
      return;
    }

    const toolsDir = path.dirname(cliPath);
    const gameDir = findGameDir(lolExePath);

    sendLog(`[SYSTEM] Game folder verified: ${gameDir}`);

    const installedDir = path.join(getUserDataDir(), 'installed');
    const profileDir = path.join(getUserDataDir(), 'profiles', 'Default Profile');
    const configFilePath = path.join(getUserDataDir(), 'profiles', 'Default Profile.config');

    [installedDir, profileDir, path.dirname(configFilePath)].forEach(d => {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });
    if (!fs.existsSync(configFilePath)) fs.writeFileSync(configFilePath, '');

    const isDirectory = fs.existsSync(skinPath) && fs.statSync(skinPath).isDirectory();
    let modFolderName;

    if (isDirectory) {
      modFolderName = path.basename(skinPath);
    } else {
      modFolderName = path.basename(skinPath, path.extname(skinPath)).replace(/[^a-zA-Z0-9_\- ]/g, '_');
    }

    const targetSkinDir = path.join(installedDir, modFolderName);
    // Klasör mü kontrolü yap (ENOTDIR önleme)
    const targetIsDirectory = fs.existsSync(targetSkinDir) && fs.statSync(targetSkinDir).isDirectory();
    let isFolderEmpty = true;
    let hasUsableImportedMod = false;
    if (targetIsDirectory) {
      try {
        isFolderEmpty = fs.readdirSync(targetSkinDir).length === 0;
        const wadDir = path.join(targetSkinDir, 'WAD');
        const metaFile = path.join(targetSkinDir, 'META', 'info.json');
        hasUsableImportedMod = fs.existsSync(wadDir) && fs.statSync(wadDir).isDirectory() && fs.readdirSync(wadDir).length > 0 && fs.existsSync(metaFile);
      } catch (_) { isFolderEmpty = true; }
    }

    // Yarım kalmış .tmp klasörlerini geçerli kurulum sanma; yeniden içe aktar.
    const needsImport = !isDirectory && (!targetIsDirectory || isFolderEmpty || !hasUsableImportedMod);
    const effectiveSkinDir = isDirectory ? skinPath : targetSkinDir;
    const effectiveFolderName = path.basename(effectiveSkinDir);
    const selectedOverlayKey = data.allMods && Array.isArray(data.modNames) ? [...new Set(data.modNames.map(name => String(name).replace(/[\\/]/g, "")))].sort().join("|") : "";
    const overlayKey = `${effectiveFolderName}|${gameDir}|${selectedOverlayKey}`;

    // Eğer skinPath bir klasörse ve installed içinde değilse kopyala
    if (isDirectory && skinPath !== targetSkinDir) {
      try {
        const sourceKey = path.resolve(skinPath);
        const sourceSignature = getDirectorySignature(skinPath);
        let copyCache = {};
        try { if (fs.existsSync(sourceCopyCachePath)) copyCache = JSON.parse(fs.readFileSync(sourceCopyCachePath, 'utf8')) || {}; } catch (_) { copyCache = {}; }
        const canReuseCopy = targetIsDirectory && copyCache[sourceKey] === sourceSignature;
        if (canReuseCopy) {
          sendLog('[CACHE] Değişmeyen skin klasörü yeniden kopyalanmadı.');
        } else {
          if (targetIsDirectory) fs.rmSync(targetSkinDir, { recursive: true, force: true });
          fs.cpSync(skinPath, targetSkinDir, { recursive: true });
          copyCache[sourceKey] = sourceSignature;
          try { fs.writeFileSync(sourceCopyCachePath, JSON.stringify(copyCache, null, 2)); } catch (_) {}
        }
      } catch (cpErr) {
        console.warn('[RunSkinPrep] Kopya uyarısı:', cpErr.message);
      }
    }

    // Hedef dizin bir klasörse ham assets dosyalarını WAD formatına dönüştür
    if (preparedOverlayKey !== overlayKey && fs.existsSync(effectiveSkinDir) && fs.statSync(effectiveSkinDir).isDirectory()) {
      await ensureWadStructure(effectiveSkinDir, gameDir, cliPath);
    }

    const startOverlayProcess = () => {
      try {
        const logFilePath = path.join(getUserDataDir(), 'mod-hata.txt');
        const logFile = fs.openSync(logFilePath, 'w');
        activeModProcess = spawn(cliPath, ['runoverlay', profileDir, configFilePath, `--game:${gameDir}`, '--opts:none'], { cwd: toolsDir, detached: false, windowsHide: true, stdio: ['pipe', logFile, logFile] });
        sendLog(`[BAŞARILI] cslol-dll.dll bağlandı! Oyuna girebilirsin.`);
        finish({ success: true, message: 'Mod oyuna başarıyla bağlandı!' });
      } catch (spawnErr) {
        sendLog(`[ÇALIŞTIRMA HATASI] ${spawnErr.message}`);
        finish({ success: false, message: `Çalıştırma Hatası: ${spawnErr.message}` });
      }
    };

    const executeOverlay = (retryCount = 0) => {
      if (preparedOverlayKey === overlayKey && fs.existsSync(profileDir)) {
        sendLog('[CACHE] Hazırlanmış overlay yeniden kullanılıyor...');
        startOverlayProcess();
        return;
      }
      // 1) Yalnızca bu uygulamaya ait aktif süreci durdur; diğer mod araçlarına dokunma.
      stopActiveModProcess();

      // 2) Profile klasörünü temizle
      try {
        if (fs.existsSync(profileDir)) {
          fs.rmSync(profileDir, { recursive: true, force: true });
        }
      } catch (rmErr) {
        console.warn('[ProfileClean] Temizleme uyarısı:', rmErr.message);
      }
      fs.mkdirSync(profileDir, { recursive: true });

      sendLog(`[OVERLAY] Profile overlay oluşturuluyor (${effectiveFolderName})...`);
      let overlayInputDir = installedDir;
      if (data.allMods && Array.isArray(data.modNames) && data.modNames.length > 0) {
        const selectedModsDir = path.join(getUserDataDir(), 'selected-overlay-mods');
        const stagingDir = selectedModsDir + '.tmp';
        const storeInstalledDir = path.join(getUserDataDir(), 'store-installed');
        var stagedModNames = [];
        try {
          if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
          fs.mkdirSync(stagingDir, { recursive: true });
          for (const modName of [...new Set(data.modNames)]) {
            const safeName = String(modName || '').replace(/[\\/]/g, '');
            if (!safeName || safeName === '.' || safeName === '..') continue;
            const installedMod = path.join(installedDir, safeName);
            const storeMod = path.join(storeInstalledDir, safeName);
            let sourceMod = fs.existsSync(installedMod) ? installedMod : storeMod;
            if (!fs.existsSync(sourceMod)) {
              for (const root of [installedDir, storeInstalledDir]) {
                try {
                  const match = fs.readdirSync(root, { withFileTypes: true }).find(entry => entry.isDirectory() && entry.name.toLowerCase() === safeName.toLowerCase());
                  if (match) { sourceMod = path.join(root, match.name); break; }
                } catch (_) {}
              }
            }
            const targetMod = path.join(stagingDir, safeName);
            if (fs.existsSync(sourceMod) && fs.statSync(sourceMod).isDirectory()) {
              fs.cpSync(sourceMod, targetMod, { recursive: true });
              stagedModNames.push(safeName);
            } else sendLog(`[OVERLAY] Seçili mod klasörü bulunamadı: ${safeName}`);
          }
          if (fs.existsSync(selectedModsDir)) fs.rmSync(selectedModsDir, { recursive: true, force: true });
          fs.renameSync(stagingDir, selectedModsDir);
          overlayInputDir = selectedModsDir;
        } catch (stageErr) {
          sendLog(`[OVERLAY] Seçili modlar hazırlanamadı: ${stageErr.message}`);
        }
      }
      const mkOverlayArgs = ['mkoverlay', overlayInputDir, profileDir, `--game:${gameDir}`, '--noTFT', '--ignoreConflict'];
      if (data.allMods) {
        const selectedNames = [...new Set((stagedModNames || data.modNames || []).map(name => String(name).replace(/[\\/]/g, '')))].filter(Boolean);
        if (!selectedNames.length) {
          finish({ success: false, message: 'Seçili mod klasörleri bulunamadı; overlay oluşturulamadı.' });
          return;
        }
        if (selectedNames.length) mkOverlayArgs.splice(4, 0, `--mods:${selectedNames.join('/')}`);
      } else {
        mkOverlayArgs.splice(4, 0, `--mods:${effectiveFolderName}`);
      }

      execFile(cliPath, mkOverlayArgs, { cwd: toolsDir, windowsHide: true, timeout: 0, maxBuffer: 8 * 1024 * 1024 }, (mkErr, mkStdout, mkStderr) => {
        if (mkErr) {
          const errStr = (mkStderr || mkErr.message).toString();
          if (retryCount < 2 && (errStr.includes('file.error') || errStr.includes('kullanıldığından') || errStr.includes('locked'))) {
            cleanupLingeringToolProcesses();
            sendLog(`[OVERLAY UYARISI] Dosya kilitli, 600ms sonra tekrar deneniyor (${retryCount + 1}/2)...`);
            setTimeout(() => executeOverlay(retryCount + 1), 600);
            return;
          }
          sendLog(`[OVERLAY HATASI] ${errStr}`);
          finish({ success: false, message: `Overlay Hatası: ${errStr}` });
          return;
        }

        preparedOverlayKey = overlayKey; try { fs.writeFileSync(preparedOverlayKeyFile, overlayKey, "utf8"); } catch (_) {}
        sendLog(`[DLL HOOK] cslol-dll.dll enjekte ediliyor ve oyuna bağlanıyor...`);

        try {
          const logFilePath = path.join(getUserDataDir(), 'mod-hata.txt');
          const logFile = fs.openSync(logFilePath, 'w');

          activeModProcess = spawn(cliPath, [
            'runoverlay', profileDir, configFilePath,
            `--game:${gameDir}`, '--opts:none'
          ], { cwd: toolsDir, detached: false, windowsHide: true, stdio: ['pipe', logFile, logFile] });

          sendLog(`[BAŞARILI] cslol-dll.dll bağlandı! Oyuna girebilirsin.`);
          finish({ success: true, message: 'Mod oyuna başarıyla bağlandı!' });
        } catch (spawnErr) {
          sendLog(`[ÇALIŞTIRMA HATASI] ${spawnErr.message}`);
          finish({ success: false, message: `Çalıştırma Hatası: ${spawnErr.message}` });
        }
      });
    };

    if (needsImport) {
      sendLog(`[İÇE AKTARMA] Skin paketi installed/ klasörüne çıkartılıyor...`);
      if (fs.existsSync(targetSkinDir) && !fs.statSync(targetSkinDir).isDirectory()) {
        try { fs.unlinkSync(targetSkinDir); } catch (_) {}
      }
      if (!fs.existsSync(targetSkinDir)) fs.mkdirSync(targetSkinDir, { recursive: true });

      const importArgs = ['import', skinPath, targetSkinDir, `--game:${gameDir}`, '--noTFT'];
      execFile(cliPath, importArgs, { cwd: toolsDir, windowsHide: true, timeout: 0, maxBuffer: 8 * 1024 * 1024 }, (importErr, stdout, stderr) => {
        if (importErr) {
          sendLog(`[İÇE AKTARMA HATASI] ${stderr || importErr.message}`);
          try { if (fs.existsSync(targetSkinDir)) fs.rmSync(targetSkinDir, { recursive: true, force: true }); } catch (_) {}
          finish({ success: false, message: `Import Hatası: ${stderr || importErr.message}` });
          return;
        }

        const metaDir = path.join(targetSkinDir, 'META');
        const wadDir = path.join(targetSkinDir, 'WAD');
        if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
        if (!fs.existsSync(wadDir)) fs.mkdirSync(wadDir, { recursive: true });
        if (!fs.existsSync(path.join(metaDir, 'info.json'))) {
          fs.writeFileSync(path.join(metaDir, 'info.json'), JSON.stringify({ author: "Herobrine", name: effectiveFolderName, version: "1.0.0" }, null, 2));
        }

        if (data.prepareOnly) finish({ success: true, modName: effectiveFolderName, message: 'Skin paketi hazırlandı.' });
        else executeOverlay();
      });
    } else {
      if (data.prepareOnly) finish({ success: true, modName: effectiveFolderName, message: 'Skin paketi hazırlandı.' });
      else executeOverlay();
    }
  });
});

// ── OTOMATİK GÜNCELLEME KONTROLCÜSÜ (GITHUB RELEASES) ──────────────────────────
ipcMain.handle('get-app-version', async () => {
  try {
    const pkgPath = path.resolve(__dirname, 'package.json');
    delete require.cache[pkgPath];
    return String(require(pkgPath).version || '1.0.7');
  } catch (_) {
    return '1.0.7';
  }
});

ipcMain.handle('check-app-update', async () => {
  try {
    // Require cache temizle - her seferinde güncel package.json oku
    const pkgPath = require('path').resolve(__dirname, 'package.json');
    delete require.cache[pkgPath];
    const pkg = require(pkgPath);
    const currentVersion = (pkg.version || '1.0.0').replace(/^v/i, '').trim();
    console.log('[AutoUpdate] Mevcut sürüm:', currentVersion);

    // 1) GitHub Releases API (skynix-manager-)
    const releaseRes = await fetch('https://api.github.com/repos/Herobrine-2/skynix-manager-/releases/latest', {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Skynix-Manager-App' }
    });
    console.log('[AutoUpdate] GitHub API status:', releaseRes.status);
    if (releaseRes.ok) {
      const release = await releaseRes.json();
      const latestVersion = String(release.tag_name || release.name || '').replace(/^v/i, '').trim();
      const isNewer = latestVersion && latestVersion.localeCompare(currentVersion, undefined, { numeric: true, sensitivity: 'base' }) > 0;
      console.log('[AutoUpdate] GitHub sürüm:', latestVersion, '| isNewer:', isNewer);
      if (isNewer) {
        const asset = Array.isArray(release.assets) && release.assets.find(a => /setup.*\.exe$/i.test(a.name || '') || /\.exe$/i.test(a.name || ''));
        return {
          hasUpdate: true,
          currentVersion,
          latestVersion,
          releaseTitle: release.name || `Skynix Manager v${latestVersion}`,
          downloadUrl: asset?.browser_download_url || release.html_url || 'https://github.com/Herobrine-2/skynix-manager-/releases',
          changelog: release.body || 'Yeni özellikler, hata düzeltmeleri ve performans iyileştirmeleri eklendi.',
          publishedAt: release.published_at || ''
        };
      }
    }

    // 2) Fallback: version.json
    try {
      const versionUrl = 'https://raw.githubusercontent.com/Herobrine-2/skynix-manager-shop/main/version.json?t=' + Date.now();
      const res = await fetch(versionUrl, { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        const latestVersion = String(data.version || '1.0.0').replace(/^v/i, '').trim();
        const isNewer = latestVersion.localeCompare(currentVersion, undefined, { numeric: true, sensitivity: 'base' }) > 0;
        if (isNewer) {
          return {
            hasUpdate: true,
            currentVersion,
            latestVersion,
            releaseTitle: data.title || `Skynix Manager v${latestVersion}`,
            downloadUrl: data.downloadUrl || 'https://github.com/Herobrine-2/skynix-manager-/releases',
            changelog: data.changelog || 'Yeni özellikler ve iyileştirmeler eklendi.',
            publishedAt: ''
          };
        }
      }
    } catch (_) {}
  } catch (err) {
    console.warn('[AutoUpdate] Güncelleme kontrol hatası:', err.message);
  }
  return { hasUpdate: false };
});

// ── OTOMATİK İNDİRME VE KURULUM MOTORU ─────────────────────────────────────────
ipcMain.handle('download-and-install-update', async (event, data) => {
  const downloadUrl = data?.downloadUrl;
  if (!downloadUrl) return { success: false, message: 'İndirme bağlantısı bulunamadı.' };

  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const tempDir = app.getPath('temp');
  const installerPath = path.join(tempDir, `Skynix-Update-${Date.now()}.exe`);

  const sendProgress = (pct, speed, downloaded, total, msg) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('app-update-download-progress', { pct, speed, downloaded, total, msg });
    }
  };

  return new Promise((resolve) => {
    const downloadFile = (targetUrl, redirectCount = 0) => {
      if (redirectCount > 10) {
        return resolve({ success: false, message: 'Çok fazla yönlendirme hatası.' });
      }

      const https = require('https');
      const http = require('http');
      const client = targetUrl.startsWith('https') ? https : http;

      const req = client.get(targetUrl, { headers: { 'User-Agent': 'Skynix-Manager-App' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return downloadFile(res.headers.location, redirectCount + 1);
        }

        if (res.statusCode !== 200) {
          return resolve({ success: false, message: `İndirme sunucusu yanıt vermedi (HTTP ${res.statusCode})` });
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        let lastReportTime = Date.now();
        let lastReportBytes = 0;

        const fileStream = fs.createWriteStream(installerPath);
        res.pipe(fileStream);

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const now = Date.now();
          if (now - lastReportTime >= 150) {
            const timeDelta = (now - lastReportTime) / 1000;
            const bytesDelta = downloadedBytes - lastReportBytes;
            const speedBytesPerSec = timeDelta > 0 ? (bytesDelta / timeDelta) : 0;
            const speedMB = (speedBytesPerSec / (1024 * 1024)).toFixed(1);
            const pct = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
            const downMB = (downloadedBytes / (1024 * 1024)).toFixed(1);
            const totMB = (totalBytes / (1024 * 1024)).toFixed(1);

            sendProgress(pct, `${speedMB} MB/s`, `${downMB} MB`, `${totMB} MB`, 'İndiriliyor...');
            lastReportTime = now;
            lastReportBytes = downloadedBytes;
          }
        });

        fileStream.on('finish', () => {
          fileStream.close(() => {
            console.log('[AutoUpdate] İndirme tamamlandı:', installerPath);
            const confirmUpdate = dialog.showMessageBox(mainWindow, {
              type: 'question',
              buttons: ['Güncellemeyi Başlat', 'Daha Sonra'],
              defaultId: 0,
              cancelId: 1,
              title: 'Skynix Manager Güncellemesi',
              message: 'Yeni sürüm indirildi.',
              detail: 'Kurulum için uygulama yeniden başlatılacak. Güncelleme şimdi başlatılsın mı?'
            });

            confirmUpdate.then(({ response }) => {
              if (response !== 0) {
                fs.unlink(installerPath, () => {});
                resolve({ success: false, canceled: true, message: 'Güncelleme daha sonra yapılacak.' });
                return;
              }

              sendProgress(100, '', '', '', 'Kurulum başlatılıyor...');
              try {
                // NSIS kurulumu gizli çalışır; uygulama kapandıktan sonra dosyalar güncellenir.
                const helperPath = path.join(tempDir, `Skynix-Update-${Date.now()}.cmd`);
                const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
                const launchTarget = process.execPath;
                const launchArgs = app.isPackaged
                  ? `start "" ${quote(launchTarget)}`
                  : `start "" ${quote(launchTarget)} ${quote(getAppRoot())}`;
                const helper = [
                  '@echo off',
                  'timeout /t 2 /nobreak >nul',
                  `start /wait "" ${quote(installerPath)} /S`,
                  `del /q ${quote(installerPath)} >nul 2>&1`,
                  launchArgs,
                  'del "%~f0"'
                ].join('\r\n');
                fs.writeFileSync(helperPath, helper, 'utf8');

                const child = spawn('cmd.exe', ['/d', '/c', helperPath], {
                  detached: true,
                  windowsHide: true,
                  stdio: 'ignore'
                });
                child.unref();

                setTimeout(() => {
                  isQuittingApp = true;
                  app.quit();
                }, 250);

                resolve({ success: true, message: 'Güncelleme arka planda kuruluyor...' });
              } catch (spawnErr) {
                console.error('[AutoUpdate] Installer çalıştırma hatası:', spawnErr);
                resolve({ success: false, message: 'Güncelleme başlatılamadı: ' + spawnErr.message });
              }
            }).catch((dialogErr) => {
              fs.unlink(installerPath, () => {});
              resolve({ success: false, message: 'Güncelleme onayı alınamadı: ' + dialogErr.message });
            });
          });
        });

        fileStream.on('error', (err) => {
          fs.unlink(installerPath, () => {});
          resolve({ success: false, message: 'Dosya yazma hatası: ' + err.message });
        });
      });

      req.on('error', (err) => {
        resolve({ success: false, message: 'Bağlantı hatası: ' + err.message });
      });
    };

    downloadFile(downloadUrl);
  });
});






























