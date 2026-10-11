const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');

let tempDir;

test.before(async () => {
  tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'quickdocs-persist-'));
  process.env.DOCSEARCH_INDEX_DIR = tempDir;
});

test.after(async () => {
  delete process.env.DOCSEARCH_INDEX_DIR;
  if (tempDir) await fsp.rm(tempDir, { recursive: true, force: true });
});

function freshPersist() {
  delete require.cache[require.resolve('../engine/persist')];
  return require('../engine/persist');
}

function sampleIndex(text, builtAt) {
  return {
    version: 8,
    folders: ['/资料'],
    builtAt,
    docs: [{ id: 0, path: '/资料/a.txt', name: 'a.txt', mtime: builtAt, text, tokens: ['测试'] }],
    inverted: { 测试: [0] },
    skipped: 0,
    reused: 0,
    total: 1
  };
}

test('保存后 meta 指向同一代正文和分词文件', async () => {
  const persist = freshPersist();
  const saved = await persist.saveIndex(sampleIndex('第一代正文', 1));
  const meta = JSON.parse(await fsp.readFile(path.join(tempDir, 'meta.json'), 'utf8'));
  assert.match(meta.textsFile, /^texts-.+\.bin$/);
  assert.match(meta.tokensFile, /^tokens-.+\.json$/);
  assert.equal(saved.getText(0), '第一代正文');
  saved.close();

  const opened = await persist.openIndex();
  assert.equal(opened.getText(0), '第一代正文');
  assert.deepEqual(await persist.loadTokens(opened), { '/资料/a.txt': ['测试'] });
  opened.close();
});

test('新一代提交后清理旧数据且读取新正文', async () => {
  const persist = freshPersist();
  const saved = await persist.saveIndex(sampleIndex('第二代正文', 2));
  const names = await fsp.readdir(tempDir);
  assert.equal(names.filter((name) => /^texts-.+\.bin$/.test(name)).length, 1);
  assert.equal(names.filter((name) => /^tokens-.+\.json$/.test(name)).length, 1);
  assert.equal(saved.getText(0), '第二代正文');
  saved.close();
});

test('越界的正文偏移会使损坏索引失效', async () => {
  const persist = freshPersist();
  const metaPath = path.join(tempDir, 'meta.json');
  const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
  meta.docs[0].len = Number.MAX_SAFE_INTEGER;
  await fsp.writeFile(metaPath, JSON.stringify(meta));
  assert.equal(await persist.openIndex(), null);
});

test('清空会删除 meta、正文和分词缓存', async () => {
  const persist = freshPersist();
  await persist.clearIndex();
  assert.equal(await persist.openIndex(), null);
  const names = await fsp.readdir(tempDir);
  assert.deepEqual(names, []);
});
