const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const { extract, isSupported, normalizeExtracted } = require('../engine/extract');
const { buildIndex } = require('../engine/indexer');

const samples = path.join(__dirname, '..', '示例文档');

test('示例 TXT 与 DOCX 可以抽取正文', async () => {
  const txt = await extract(path.join(samples, '2019_用地审批办法.txt'));
  const docx = await extract(path.join(samples, '2021_审批时限补充规定.docx'));
  assert.match(txt, /建设用地审批/);
  assert.match(docx, /审批时限/);
});

test('示例资料库可以完整建立索引', async () => {
  const built = await buildIndex([samples], null, null, {});
  assert.equal(built.version, 8);
  assert.equal(built.total, 4);
  assert.equal(built.docs.length, 4);
  assert.equal(built.skipped, 0);
});

test('未开启 OCR 时图片不进入索引并给出明确计数', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quickdocs-images-'));
  try {
    fs.writeFileSync(path.join(dir, 'scan.png'), Buffer.from('not-a-real-image'));
    fs.writeFileSync(path.join(dir, 'note.txt'), '可搜索正文');
    const built = await buildIndex([dir], null, null, { ocr: false });
    assert.equal(built.total, 1);
    assert.equal(built.docs.length, 1);
    assert.equal(built.ignoredImages, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PDF/OCR 清洗保持英文词间空格并修复中文与全角字符', () => {
  assert.equal(normalizeExtracted('杭 州 high quality ２０２６ （ 5 ）'), '杭州 high quality 2026（5）');
});

test('扩展名支持范围明确', () => {
  for (const ext of ['txt', 'md', 'csv', 'log', 'docx', 'ofd', 'pdf', 'doc', 'wps',
    'pptx', 'pptm', 'ppsx', 'potx', 'xlsx', 'xlsm', 'png', 'jpg', 'jpeg', 'bmp', 'webp', 'tif', 'tiff']) {
    assert.equal(isSupported(`sample.${ext}`), true, ext);
  }
  assert.equal(isSupported('sample.ppt'), false);
  assert.equal(isSupported('sample.xls'), false);
});

test('PPTX 与 XLSX 可以抽取真实可搜索文字并保留页/表边界', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quickdocs-office-'));
  try {
    const ppt = new JSZip();
    ppt.file('ppt/slides/slide1.xml', '<p:sld><a:p><a:r><a:t>第一页规划标题</a:t></a:r></a:p></p:sld>');
    ppt.file('ppt/slides/slide2.xml', '<p:sld><a:p><a:r><a:t>第二页实施内容</a:t></a:r></a:p></p:sld>');
    const pptPath = path.join(dir, 'sample.pptx');
    fs.writeFileSync(pptPath, await ppt.generateAsync({ type: 'nodebuffer' }));
    const pptText = await extract(pptPath);
    assert.match(pptText, /【第 1 页】\n第一页规划标题/);
    assert.match(pptText, /【第 2 页】\n第二页实施内容/);

    const xlsx = new JSZip();
    xlsx.file('xl/sharedStrings.xml', '<sst><si><t>部门意见</t></si><si><t>动态维护</t></si></sst>');
    xlsx.file('xl/workbook.xml', '<workbook><sheets><sheet name="评估表" r:id="rId1"/></sheets></workbook>');
    xlsx.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
    xlsx.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row><row><c t="inlineStr"><is><t>整改完成</t></is></c></row></sheetData></worksheet>');
    const xlsxPath = path.join(dir, 'sample.xlsx');
    fs.writeFileSync(xlsxPath, await xlsx.generateAsync({ type: 'nodebuffer' }));
    const xlsxText = await extract(xlsxPath);
    assert.match(xlsxText, /【工作表：评估表】/);
    assert.match(xlsxText, /部门意见\t动态维护/);
    assert.match(xlsxText, /整改完成/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
