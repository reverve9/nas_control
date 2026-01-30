const fs = require('fs');
const tempPath = '/Volumes/Works/Project/2026/00_temp.';

const items = fs.readdirSync(tempPath);
items.forEach(name => {
  console.log('파일명:', name);
  console.log('hex:', Buffer.from(name).toString('hex'));
  console.log('최종 포함:', name.includes('최종'));
  console.log('---');
});
