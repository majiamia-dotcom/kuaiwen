// 文本抽取 worker 线程池：把多份文档的解析+分词分发到多核并行，主进程保持跟手。
// 设计为「可有可无」——createPool 出任何问题，上层（indexer）会回退到串行，最坏只是没加速。
// 单个 worker 异常退出（如某个畸形文件让解析库崩溃）只让该任务失败、并自动补一个新 worker，不拖垮整池。
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');

const WORKER_FILE = path.join(__dirname, 'extractWorker.js');

// 默认并发：留一个核给主进程/UI；OCR 很吃内存，限得更保守。
function defaultSize(ocr) {
  const n = (os.cpus() && os.cpus().length) || 2;
  const cap = ocr ? 2 : 4;
  return Math.max(1, Math.min(n - 1, cap));
}

function createPool(opts = {}) {
  const size = opts.size || defaultSize(opts.ocr);
  const workers = [];        // 所有 worker 记录 {worker, taskId}
  const idle = [];           // 空闲 worker 记录
  const queue = [];          // 待处理任务
  const inflight = new Map(); // id -> task
  let nextId = 1;
  let destroyed = false;

  function spawn() {
    const rec = { worker: new Worker(WORKER_FILE), taskId: 0 };
    rec.worker.on('message', (msg) => {
      if (msg && msg.log) { // OCR 进度
        const t = inflight.get(msg.id);
        if (t && t.onLog) t.onLog(msg.log);
        return;
      }
      const t = inflight.get(msg.id);
      if (!t) return;
      inflight.delete(msg.id);
      rec.taskId = 0;
      if (msg.error) t.reject(new Error(msg.error));
      else t.resolve({ text: msg.text, tokens: msg.tokens });
      idle.push(rec);
      pump();
    });
    const onDead = () => {
      // worker 异常退出：让在飞任务失败（上层当跳过），并补一个新 worker 维持池子健康。
      if (rec.taskId) {
        const t = inflight.get(rec.taskId);
        if (t) { inflight.delete(rec.taskId); t.reject(new Error('worker 异常退出')); }
        rec.taskId = 0;
      }
      const i = workers.indexOf(rec); if (i >= 0) workers.splice(i, 1);
      const j = idle.indexOf(rec); if (j >= 0) idle.splice(j, 1);
      if (!destroyed) { spawn(); pump(); }
    };
    rec.worker.on('error', onDead);
    rec.worker.on('exit', (code) => { if (code !== 0) onDead(); });
    workers.push(rec);
    idle.push(rec);
  }

  function pump() {
    while (idle.length && queue.length) {
      const rec = idle.pop();
      const t = queue.shift();
      rec.taskId = t.id;
      inflight.set(t.id, t);
      rec.worker.postMessage({ id: t.id, path: t.path, ocr: t.ocr });
    }
  }

  for (let i = 0; i < size; i++) spawn();

  return {
    size,
    // 解析一份文档，返回 {text, tokens}；失败则 reject（上层按跳过处理）。
    run(filePath, ocr, onLog) {
      return new Promise((resolve, reject) => {
        queue.push({ id: nextId++, path: filePath, ocr: !!ocr, onLog, resolve, reject });
        pump();
      });
    },
    async destroy() {
      destroyed = true;
      await Promise.all(workers.map((r) => r.worker.terminate().catch(() => {})));
      workers.length = 0; idle.length = 0; queue.length = 0; inflight.clear();
    }
  };
}

module.exports = { createPool };
