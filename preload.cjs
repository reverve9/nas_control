const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 설정
  getConfig: () => ipcRenderer.invoke('get-config'),
  
  // 파일 시스템
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  moveFile: (source, dest) => ipcRenderer.invoke('move-file', source, dest),
  getFileInfo: (filePath) => ipcRenderer.invoke('get-file-info', filePath),
  
  // AI 분류
  classifyFile: (filePath) => ipcRenderer.invoke('classify-file', filePath),
  getProjectFolders: () => ipcRenderer.invoke('get-project-folders'),
  getSubfolders: (projectName) => ipcRenderer.invoke('get-subfolders', projectName),
  
  // 스케줄러 & 알림
  getPendingFiles: () => ipcRenderer.invoke('get-pending-files'),
  scanNow: () => ipcRenderer.invoke('scan-now'),
  clearPending: () => ipcRenderer.invoke('clear-pending'),
  markComplete: (filePath) => ipcRenderer.invoke('mark-complete', filePath),
  
  // 메인 프로세스 이벤트 수신
  onShowPendingFiles: (callback) => ipcRenderer.on('show-pending-files', (event, files) => callback(files))
});
