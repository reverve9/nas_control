const fs = require('fs');
const tempPath = '/Volumes/Works/Project/2026/00_temp.';

const keywords = ['최종', 'final', '완료', 'done', 'complete', '끝'];

function hasCompletionKeyword(filename) {
  return keywords.some(keyword => filename.includes(keyword));
}

const items = fs.readdirSync(tempPath, { withFileTypes: true });
const files = items.filter(item => !item.isDirectory() && !item.name.startsWith('.'));

console.log('파일 목록:');
files.forEach(file => {
  const hasKeyword = hasCompletionKeyword(file.name);
  console.log(file.name, '-> 최종:', hasKeyword);
});
