const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// electron-store 동적 로드 (ESM 모듈)
let store = null;
async function initStore() {
  const Store = (await import('electron-store')).default;
  store = new Store({
    defaults: {
      lastPath: null,
      tempFolder: process.env.TEMP_FOLDER || '00_temp.'
    }
  });
}

console.log('API Key loaded:', process.env.ANTHROPIC_API_KEY ? 'Yes' : 'No');

const NAS_BASE_PATH = process.env.NAS_BASE_PATH || '/Volumes/Works/Project';
const CURRENT_YEAR = process.env.CURRENT_YEAR || '2026';
const TEMP_FOLDER = process.env.TEMP_FOLDER || '00_temp.';
const ALERT_HOUR = 17; // 오후 5시

let mainWindow;
let tray;
let pendingFiles = [];
let schedulerInterval;
let claudeModule = null;

// Claude 모듈 동적 로드 (ESM)
async function loadClaudeModule() {
  claudeModule = await import('./claude.js');
}

// 트레이 아이콘 생성
function createTrayIcon(hasAlert = false) {
  const iconName = hasAlert ? 'tray-alert-icon.png' : 'tray-icon.png';
  const iconPath = path.join(__dirname, 'public', iconName);
  let icon = nativeImage.createFromPath(iconPath);
  
  // 템플릿 이미지로 설정 (다크모드 대응) - 알림 아이콘은 제외
  if (!hasAlert) {
    icon.setTemplateImage(true);
  }
  
  return icon;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = createTrayIcon(false);
  tray = new Tray(icon);
  tray.setToolTip('NAS Control');
  
  updateTrayMenu();
  
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      if (pendingFiles.length > 0) {
        mainWindow.webContents.send('show-pending-files', pendingFiles);
      }
    }
  });
}

function updateTrayIcon(hasAlert) {
  if (tray) {
    tray.setImage(createTrayIcon(hasAlert));
  }
}

function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: pendingFiles.length > 0 ? `정리할 파일 ${pendingFiles.length}개` : '정리할 파일 없음',
      enabled: pendingFiles.length > 0,
      click: () => {
        mainWindow.show();
        mainWindow.webContents.send('show-pending-files', pendingFiles);
      }
    },
    { type: 'separator' },
    { 
      label: '앱 열기', 
      click: () => mainWindow.show() 
    },
    { 
      label: '지금 스캔', 
      click: () => scanForPendingFiles() 
    },
    { type: 'separator' },
    { 
      label: '종료', 
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  tray.setToolTip(pendingFiles.length > 0 ? `NAS Control - ${pendingFiles.length}개 파일 대기` : 'NAS Control');
}

// 파일명에 완료 키워드 포함 여부
function hasCompletionKeyword(filename) {
  const keywords = ['최종', 'final', '완료', 'done', 'complete', '끝'];
  // 맥 파일시스템 NFD → NFC 정규화
  const normalizedName = filename.normalize('NFC').toLowerCase();
  return keywords.some(keyword => normalizedName.includes(keyword.toLowerCase()));
}

// 24시간 지났는지 확인
function isOlderThan24Hours(mtime) {
  const now = new Date();
  const diff = now - new Date(mtime);
  const hours = diff / (1000 * 60 * 60);
  return hours >= 24;
}

// 대기 파일 스캔
async function scanForPendingFiles() {
  // 저장된 경로 또는 기본 경로 사용
  const savedPath = store ? store.get('lastPath') : null;
  const tempPath = savedPath || path.join(NAS_BASE_PATH, CURRENT_YEAR, TEMP_FOLDER);
  
  try {
    const items = fs.readdirSync(tempPath, { withFileTypes: true });
    const files = items.filter(item => !item.isDirectory() && !item.name.startsWith('.'));
    
    pendingFiles = [];
    
    for (const file of files) {
      const filePath = path.join(tempPath, file.name);
      const stats = fs.statSync(filePath);
      
      const hasKeyword = hasCompletionKeyword(file.name);
      const isOld = isOlderThan24Hours(stats.mtime);
      
      if (hasKeyword || isOld) {
        pendingFiles.push({
          name: file.name,
          path: filePath,
          reason: hasKeyword ? '파일명에 완료 키워드' : '24시간 경과',
          mtime: stats.mtime
        });
      }
    }
    
    // 트레이 아이콘 업데이트
    updateTrayIcon(pendingFiles.length > 0);
    updateTrayMenu();
    
    // 알림 표시
    if (pendingFiles.length > 0) {
      const notification = new Notification({
        title: 'NAS Control',
        body: `${pendingFiles.length}개 파일 정리가 필요해요!`,
        silent: false
      });
      
      notification.on('click', () => {
        mainWindow.show();
        mainWindow.webContents.send('show-pending-files', pendingFiles);
      });
      
      notification.show();
    }
    
    console.log(`스캔 완료: ${pendingFiles.length}개 파일 대기`);
    return pendingFiles;
    
  } catch (error) {
    console.error('스캔 실패:', error);
    return [];
  }
}

// 스케줄러 시작 (매분 체크, 오후 5시에 스캔)
function startScheduler() {
  let lastScanDate = null;
  
  schedulerInterval = setInterval(() => {
    const now = new Date();
    const today = now.toDateString();
    const hour = now.getHours();
    const minute = now.getMinutes();
    
    // 오후 5시 정각 (한번만 실행)
    if (hour === ALERT_HOUR && minute === 0 && lastScanDate !== today) {
      console.log('오후 5시 스캔 시작');
      scanForPendingFiles();
      lastScanDate = today;
    }
  }, 60000); // 1분마다 체크
}

app.whenReady().then(async () => {
  await initStore();
  await loadClaudeModule();
  createWindow();
  createTray();
  startScheduler();
  
  // 앱 시작 시 한번 스캔
  setTimeout(() => scanForPendingFiles(), 3000);
});

app.on('window-all-closed', () => {
  // macOS에서는 창 닫아도 앱 유지
});

app.on('activate', () => {
  mainWindow.show();
});

// 앱 완전 종료 전
app.on('before-quit', () => {
  app.isQuitting = true;
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }
});

// IPC 핸들러들
ipcMain.handle('get-config', async () => {
  // 저장된 경로가 있으면 사용, 없으면 기본 경로
  const savedPath = store ? store.get('lastPath') : null;
  const defaultTempPath = path.join(NAS_BASE_PATH, CURRENT_YEAR, TEMP_FOLDER);
  
  return {
    basePath: NAS_BASE_PATH,
    currentYear: CURRENT_YEAR,
    tempFolder: TEMP_FOLDER,
    tempPath: savedPath || defaultTempPath
  };
});

// 경로 저장
ipcMain.handle('save-last-path', async (event, pathToSave) => {
  if (store) {
    store.set('lastPath', pathToSave);
    console.log('경로 저장됨:', pathToSave);
    return { success: true };
  }
  return { success: false };
});

// 저장된 경로 가져오기
ipcMain.handle('get-last-path', async () => {
  if (store) {
    return store.get('lastPath');
  }
  return null;
});

ipcMain.handle('read-directory', async (event, dirPath) => {
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    
    // 경로 저장
    if (store) {
      store.set('lastPath', dirPath);
    }
    
    return items
      .filter(item => !item.name.startsWith('.'))
      .map(item => ({
        name: item.name,
        isDirectory: item.isDirectory(),
        path: path.join(dirPath, item.name)
      }));
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('move-file', async (event, sourcePath, destPath) => {
  try {
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.renameSync(sourcePath, destPath);
    
    // 이동 후 대기 목록에서 제거
    pendingFiles = pendingFiles.filter(f => f.path !== sourcePath);
    updateTrayIcon(pendingFiles.length > 0);
    updateTrayMenu();
    
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('get-file-info', async (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      name: path.basename(filePath),
      path: filePath,
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      extension: path.extname(filePath)
    };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('classify-file', async (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    const fileInfo = {
      name: path.basename(filePath),
      path: filePath,
      size: stats.size,
      modified: stats.mtime,
      extension: path.extname(filePath)
    };

    const projectFolders = claudeModule.getProjectFolders(NAS_BASE_PATH, CURRENT_YEAR);
    const result = await claudeModule.classifyFile(fileInfo, projectFolders);

    const destPath = path.join(
      NAS_BASE_PATH,
      CURRENT_YEAR,
      result.project,
      result.subfolder,
      fileInfo.name
    );

    return {
      ...result,
      sourcePath: filePath,
      destPath: destPath
    };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('get-project-folders', async () => {
  return claudeModule.getProjectFolders(NAS_BASE_PATH, CURRENT_YEAR);
});

ipcMain.handle('get-subfolders', async (event, projectName) => {
  try {
    const projectPath = path.join(NAS_BASE_PATH, CURRENT_YEAR, projectName);
    const items = fs.readdirSync(projectPath, { withFileTypes: true });
    return items
      .filter(item => item.isDirectory() && !item.name.startsWith('.'))
      .map(item => item.name);
  } catch (error) {
    console.error('하위 폴더 읽기 실패:', error);
    return [];
  }
});

// 대기 파일 목록 가져오기
ipcMain.handle('get-pending-files', async () => {
  return pendingFiles;
});

// 수동 스캔 요청
ipcMain.handle('scan-now', async () => {
  return await scanForPendingFiles();
});

// 알림 초기화 (파일 처리 완료 후)
ipcMain.handle('clear-pending', async () => {
  pendingFiles = [];
  updateTrayIcon(false);
  updateTrayMenu();
  return { success: true };
});

// 완료 버튼 - 즉시 분류 요청
ipcMain.handle('mark-complete', async (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    const fileInfo = {
      name: path.basename(filePath),
      path: filePath,
      size: stats.size,
      modified: stats.mtime,
      extension: path.extname(filePath)
    };

    const projectFolders = claudeModule.getProjectFolders(NAS_BASE_PATH, CURRENT_YEAR);
    const result = await claudeModule.classifyFile(fileInfo, projectFolders);

    const destPath = path.join(
      NAS_BASE_PATH,
      CURRENT_YEAR,
      result.project,
      result.subfolder,
      fileInfo.name
    );

    // 알림 표시
    const notification = new Notification({
      title: 'AI 분류 완료',
      body: `${fileInfo.name} → ${result.project}/${result.subfolder}`,
      silent: false
    });
    
    notification.on('click', () => {
      mainWindow.show();
    });
    
    notification.show();

    return {
      ...result,
      sourcePath: filePath,
      destPath: destPath
    };
  } catch (error) {
    return { error: error.message };
  }
});
