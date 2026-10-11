// 抽取 worker：在独立线程里把 CPU 重的「解析 + 分词」做掉，避免阻塞主进程/界面。
// 协议：主线程发 {id, path, ocr}；本 worker 回 {id, text, tokens}（成功）或 {id, error}（失败）；
//       OCR 进度用 {id, log} 回传。每个 worker 是独立 V8 实例，pdfjs 注入的全局互不影响。
const { parentPort } = require('worker_threads');
const { extract } = require('./extract');
const { tokenize } = require('./tokenize');

parentPort.on('message', async (msg) => {
  const { id, path: p, ocr } = msg;
  try {
    const text = await extract(p, { ocr, onLog: (m) => parentPort.postMessage({ id, log: m }) });
    if (text == null) { parentPort.postMessage({ id, error: '无法解析' }); return; }
    const tokens = [...new Set(tokenize(text))]; // 分词也在 worker 内完成，主线程只收结果
    parentPort.postMessage({ id, text, tokens });
  } catch (e) {
    parentPort.postMessage({ id, error: (e && e.message) || String(e) });
  }
});
