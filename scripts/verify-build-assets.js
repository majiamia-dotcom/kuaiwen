const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const required = ['chi_sim.traineddata.gz', 'eng.traineddata.gz'];
const missing = required.filter((name) => {
  const file = path.join(root, 'langs', name);
  try { return !fs.statSync(file).isFile() || fs.statSync(file).size < 1024; }
  catch { return true; }
});

if (missing.length) {
  console.error(`缺少离线 OCR 语言包：${missing.join('、')}`);
  console.error(`请放入 ${path.join(root, 'langs')} 后再打包。`);
  process.exit(1);
}

console.log('离线 OCR 语言包检查通过。');
