const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');

test('引导第一步始终进入添加文件夹，不根据旧索引跳步', () => {
  const body = rendererSource.match(/function tourAction\(action\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(body, /tourCurrent === 'logo'[\s\S]*?showTourStep\('add'\)/);
  assert.doesNotMatch(body, /indexed\s*\?/);
  assert.doesNotMatch(body, /folders\.length\s*\?/);
});

test('修正后的引导会向看过旧版引导的用户重新展示', () => {
  assert.match(rendererSource, /const ONBOARD_VER = '4';/);
});
