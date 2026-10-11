// Demo Mode for promo recording. This module is intentionally isolated from the
// real index/search pipeline so production behavior stays unchanged.

const KEYWORD = '关键词A';
const BUILT_AT = Date.UTC(2026, 5, 18, 9, 30, 0);
const DEMO_COUNT = 1286;

const folders = [
  '示例资料库/政策资料',
  '示例资料库/规划资料',
  '示例资料库/规范资料',
  '示例资料库/会议资料'
];

function date(y, m, d) {
  return { ts: Date.UTC(y, m - 1, d), prec: 'd' };
}

const docs = [
  {
    name: '示例政策文件-01.pdf',
    path: '示例资料库/政策资料/示例政策文件-01.pdf',
    mtime: Date.UTC(2026, 4, 20),
    docType: 'red',
    dRed: date(2026, 5, 20),
    dGeneric: date(2026, 5, 20),
    paras: [
      '……围绕关键词A开展政策梳理，明确工作目标、实施路径和责任分工，形成可追溯、可复用的资料清单……',
      '……各相关部门应将关键词A相关材料纳入统一归档范围，建立定期更新、动态维护和结果反馈机制……'
    ]
  },
  {
    name: '示例法规条例-02.ofd',
    path: '示例资料库/政策资料/示例法规条例-02.ofd',
    mtime: Date.UTC(2025, 11, 12),
    docType: 'law',
    dGeneric: date(2025, 12, 12),
    paras: [
      '……本条例适用于关键词A相关资料的收集、整理、使用和保管，强调全过程留痕与权限管理……',
      '……涉及关键词A的信息查询，应遵循本地处理、按需授权、结果可核验的原则……'
    ]
  },
  {
    name: '示例规划文本-2035.docx',
    path: '示例资料库/规划资料/示例规划文本-2035.docx',
    mtime: Date.UTC(2025, 7, 8),
    docType: 'plan',
    dGeneric: date(2025, 8, 8),
    paras: [
      '……在规划编制过程中，应结合关键词A相关要求，统筹空间布局与实施时序，完善重点任务台账……',
      '……针对关键词A建立阶段性评估机制，确保规划目标、项目安排和资源投入保持一致……'
    ]
  },
  {
    name: '示例技术规范-2025.pdf',
    path: '示例资料库/规范资料/示例技术规范-2025.pdf',
    mtime: Date.UTC(2025, 2, 16),
    docType: 'spec',
    dGeneric: date(2025, 3, 16),
    paras: [
      '……根据相关规范，关键词A相关内容应纳入资料归档与动态维护流程，并保留必要的版本记录……',
      '……系统应支持按关键词A定位正文命中段落，同时展示文件类型、形成时间和来源文件……'
    ]
  },
  {
    name: '示例会议纪要-01.docx',
    path: '示例资料库/会议资料/示例会议纪要-01.docx',
    mtime: Date.UTC(2024, 10, 25),
    docType: 'normal',
    dGeneric: date(2024, 11, 25),
    paras: [
      '……会议要求围绕关键词A补齐资料目录，明确牵头人员、完成时限和后续复核方式……',
      '……参会单位一致同意使用本地检索工具快速定位关键词A相关正文，提高材料核验效率……'
    ]
  }
];

function isDemoMode() {
  return process.env.QUICKDOCS_DEMO === '1'
    || process.argv.includes('--promo')
    || process.argv.includes('--demo');
}

function getFolders() {
  return folders.slice();
}

function getState() {
  return {
    demo: true,
    folders: getFolders(),
    count: DEMO_COUNT,
    builtAt: BUILT_AT
  };
}

function getBuildResult() {
  return {
    demo: true,
    count: DEMO_COUNT,
    skipped: 0,
    reused: 420,
    total: DEMO_COUNT
  };
}

function sanitizeKeyword(keyword) {
  const raw = String(keyword || '').trim();
  if (!raw) return '';
  return raw
    .replace(/宁波市/g, KEYWORD)
    .replace(/真实地名|实际地名/g, KEYWORD)
    .replace(/内部项目|真实项目/g, KEYWORD)
    .trim() || KEYWORD;
}

function snippetParts(para) {
  const pos = para.indexOf(KEYWORD);
  if (pos < 0) return { before: '', hit: KEYWORD, after: para };
  return {
    before: para.slice(Math.max(0, pos - 34), pos),
    hit: KEYWORD,
    after: para.slice(pos + KEYWORD.length, pos + KEYWORD.length + 54)
  };
}

function hitRow(doc, para) {
  const parts = snippetParts(para);
  return {
    name: doc.name,
    path: doc.path,
    mtime: doc.mtime,
    docType: doc.docType,
    dRed: doc.dRed || null,
    dJournal: null,
    dGeneric: doc.dGeneric || null,
    before: parts.before,
    hit: parts.hit,
    after: parts.after,
    para,
    kind: 'body'
  };
}

function search(keyword) {
  const safeKeyword = sanitizeKeyword(keyword);
  if (!safeKeyword) return [];
  return docs.flatMap((doc) => doc.paras.map((para) => hitRow(doc, para)));
}

module.exports = {
  KEYWORD,
  DEMO_COUNT,
  BUILT_AT,
  isDemoMode,
  getFolders,
  getState,
  getBuildResult,
  search
};
