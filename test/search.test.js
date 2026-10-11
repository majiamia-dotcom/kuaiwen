const test = require('node:test');
const assert = require('node:assert/strict');
const { search, parseDocDate, analyzeDoc, classifyDocType } = require('../engine/search');
const { tokenize } = require('../engine/tokenize');

function makeIndex(texts) {
  const docs = texts.map((text, id) => ({
    id,
    path: `/资料/${id}.txt`,
    name: `${id}.txt`,
    mtime: id + 1,
    text
  }));
  const inverted = Object.create(null);
  for (const doc of docs) {
    for (const token of new Set(tokenize(doc.text))) {
      (inverted[token] || (inverted[token] = [])).push(doc.id);
    }
  }
  return { docs, inverted };
}

test('单个汉字可以命中连续中文词', () => {
  const rows = search(makeIndex(['自然资源政策文件正文。']), '政');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].hit, '政');
});

test('多个关键词要求同一文档包含全部词', () => {
  const rows = search(makeIndex(['建设用地审批管理办法正文。', '建设用地规划正文。']), '用地 审批');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].path, '/资料/0.txt');
});

test('达到结果上限时优先保留较新的文件', () => {
  const idx = makeIndex(Array.from({ length: 501 }, () => '关键词正文内容足够长，可以正常检索。'));
  const rows = search(idx, '关键词');
  assert.equal(rows.length, 500);
  assert.equal(rows.some((row) => row.path === '/资料/500.txt'), true);
  assert.equal(rows.some((row) => row.path === '/资料/0.txt'), false);
});

test('文档内容中的 HTML 只作为普通文本返回', () => {
  const rows = search(makeIndex(['正文包含 <script>alert(1)</script> 测试关键词。']), '关键词');
  assert.equal(rows.length, 1);
  assert.match(rows[0].para, /<script>/);
});

test('日期解析拒绝不存在的日期', () => {
  assert.equal(parseDocDate('发布日期：2023年2月31日', '普通文件.txt'), null);
  assert.deepEqual(parseDocDate('发布日期：2024年2月29日', '普通文件.txt'), {
    ts: Date.UTC(2024, 1, 29),
    prec: 'd',
    source: '发布日期'
  });
});

test('期刊特征可以覆盖普通文件名分类', () => {
  assert.equal(classifyDocType('第 18 卷 第 2 期\nDOI: 10.1000/example', '研究成果.pdf'), 'journal');
});

test('普通更新日志提到 DOI/Keywords 不会误判成论文', () => {
  assert.equal(classifyDocType('Version notes: DOI links changed. Keywords are now highlighted.', 'HISTORY.txt'), 'normal');
});

test('论文优先使用正式刊期而不是收稿或修回日期', () => {
  const a = analyzeDoc('2024 年 3 月 Mar. 2024 第21卷第1期\n收稿日期：2024-01-17；修回日期：2024-02-28。', '研究成果.pdf');
  assert.equal(a.type, 'journal');
  assert.deepEqual(a.dJournal, { ts: Date.UTC(2024, 2, 1), prec: 'm', source: '期刊卷期' });
});

test('只有年度卷期时保留年度精度且不退回收稿日', () => {
  const a = analyzeDoc('城市规划 2022 年第46卷增刊2\n【收稿日期】2022-11-14', '研究成果.pdf');
  assert.deepEqual(a.dJournal, { ts: Date.UTC(2022, 0, 1), prec: 'y', source: '期刊卷期' });
});

test('文件名刊期优先于论文收稿日期', () => {
  const a = analyzeDoc('摘要内容。收稿日期：2021年12月16日。', '国土空间规划探索_2022年第1期.pdf');
  assert.equal(a.type, 'journal');
  assert.deepEqual(a.dJournal, { ts: Date.UTC(2022, 0, 1), prec: 'y', source: '文件名日期' });
});

test('论文规范引用可以补足只有卷期没有年份的页眉', () => {
  const text = '第17卷第1期\n论文正文\n欢迎引用：作者. 题名[J]. 城市与区域规划研究, 2025, 17(1): 182-195.';
  const a = analyzeDoc(text, '论文.pdf');
  assert.deepEqual(a.dJournal, { ts: Date.UTC(2025, 0, 1), prec: 'y', source: '论文规范引用' });
});
