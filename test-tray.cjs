const { app, Tray, nativeImage } = require('electron');

app.whenReady().then(() => {
  const icon = nativeImage.createEmpty();
  const tray = new Tray(icon);
  tray.setTitle('NC');
  console.log('트레이 생성됨');
});
