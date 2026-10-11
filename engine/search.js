// 搜索：倒排索引筛候选 -> 原文精确定位 -> 生成片段(2-3行上下文)+整段全文。
// 返回扁平的"命中行"数组，按文件时间排序，供三列界面展示。
const { tokenize } = require('./tokenize');

function clean(s) { return (s || '').replace(/[ \t\r\f\v]+/g, ' '); }

/* ---------- 文档日期解析（带精度，不编造缺失的月/日）----------
 * “文内时间”应代表文档发布/出版时间，而不是论文研究过程中的收稿、修回时间：
 *   红头优先“印发”；论文优先出版标签、卷期年月、规范引用、文件名刊期，收稿/修回仅兜底。
 * 返回 { ts, prec, source }（prec: 'd'日 / 'm'月 / 'y'年），解析不到返回 null（渲染层回退 mtime）。
 * ts 为排序用时间戳（缺月/日按 1 号/1 月归一，仅用于排序；显示按 prec 不展示被补的部分）。 */
const CN_DIGIT = { '〇':0,'零':0,'○':0,'O':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9 };
function cnToYear(s) { let n = 0; for (const ch of s) { if (ch in CN_DIGIT) n = n * 10 + CN_DIGIT[ch]; else if (/\d/.test(ch)) n = n * 10 + (+ch); else return null; } return n; }
function cnToNum(s) {
  if (/^\d+$/.test(s)) return +s;
  if (s.includes('十')) {
    const [a, b] = s.split('十');
    const tens = a === '' ? 1 : (a in CN_DIGIT ? CN_DIGIT[a] : null);
    const ones = b === '' ? 0 : (b in CN_DIGIT ? CN_DIGIT[b] : null);
    if (tens == null || ones == null) return null;
    return tens * 10 + ones;
  }
  return (s.length === 1 && s in CN_DIGIT) ? CN_DIGIT[s] : null;
}
// 组装 {ts,prec}：y 必填；mo/d 可空 → 决定精度。越界返回 null。
function mkDate(y, mo, d) {
  if (y == null || y < 1949 || y > 2100) return null;
  if (mo == null || isNaN(mo)) return { ts: Date.UTC(y, 0, 1), prec: 'y' };
  if (mo < 1 || mo > 12) return null;
  if (d == null || isNaN(d)) return { ts: Date.UTC(y, mo - 1, 1), prec: 'm' };
  if (d < 1 || d > 31) return null;
  const ts = Date.UTC(y, mo - 1, d);
  const check = new Date(ts);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return { ts, prec: 'd' };
}
function sourced(d, source) { return d ? { ...d, source } : null; }
const EN_MON = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
// 从一段文本里尽力提取“一个”日期(带精度)，按 日>月>年 顺序优先更精确的形式；允许数字间空格。
function grabDate(seg) {
  if (!seg) return null;
  let m;
  if ((m = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/.exec(seg))) return mkDate(+m[1], +m[2], +m[3]);
  if ((m = /(\d{4})\s*[-.\/]\s*(\d{1,2})\s*[-.\/]\s*(\d{1,2})/.exec(seg))) return mkDate(+m[1], +m[2], +m[3]);
  if ((m = /(\d{4})\s*年\s*(\d{1,2})\s*月/.exec(seg))) return mkDate(+m[1], +m[2], null);
  if ((m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/i.exec(seg))) return mkDate(+m[2], EN_MON[m[1].toLowerCase()], null);
  if ((m = /(\d{4})\s*[-.]\s*(\d{1,2})(?!\s*[-.\d])/.exec(seg))) return mkDate(+m[1], +m[2], null);
  if ((m = /(\d{4})\s*年/.exec(seg))) return mkDate(+m[1], null, null);
  return null;
}
// 找“标签：日期”形式（收稿日期/修回日期等），取标签后约 24 字内的日期；同标签多次出现取最后一处。
function labeledDate(text, label, source = label) {
  const re = new RegExp(label + '\\s*[：:]?\\s*([\\s\\S]{0,24})', 'g');
  let m, best = null;
  while ((m = re.exec(text))) { const d = grabDate(m[1]); if (d) best = sourced(d, source); }
  return best;
}
// 期刊论文首页页眉的出版年月：第X卷第Y期 / Vol.X No.Y 旁的“YYYY年M月”或英文“Mon. YYYY”。
// 关键：只取“年月”且其后不紧跟“DD日/号”，从而排除正文里的完整日期（如 2020年5月17日）。
function journalIssueDate(text) {
  const head = text.slice(0, 4000);
  // 必须带卷/期/Vol/No 等期刊标识，避免误伤普通公文/合同里出现的年月。
  if (!/(第\s*\d{1,3}\s*卷|第\s*\d{1,3}\s*期|\bVol\s*\.?\s*\d|\bNo\s*\.?\s*\d)/i.test(head)) return null;
  // 日期必须和卷/期标识出现在同一个短窗口内，避免把摘要中的政策日期误当刊期。
  let m = /(\d{4})\s*年\s*(\d{1,2})\s*月(?!\s*\d{1,2}\s*[日号])[^\n]{0,120}?(?:第\s*\d{1,3}\s*[卷期]|\bVol\s*\.?\s*\d|\bNo\s*\.?\s*\d)/i.exec(head);
  if (!m) {
    const rev = /(?:第\s*\d{1,3}\s*[卷期]|\bVol\s*\.?\s*\d|\bNo\s*\.?\s*\d)[^\n]{0,120}?(\d{4})\s*年\s*(\d{1,2})\s*月(?!\s*\d{1,2}\s*[日号])/i.exec(head);
    if (rev) m = [rev[0], rev[1], rev[2]];
  }
  if (m) return sourced(mkDate(+m[1], +m[2], null), '期刊卷期');
  // 英文刊期“Jul. 2022”也要求与卷期处于同一行的短窗口。
  m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b[^\n]{0,120}?(?:第\s*\d{1,3}\s*[卷期]|\bVol\s*\.?\s*\d|\bNo\s*\.?\s*\d)/i.exec(head);
  if (!m) {
    const rev = /(?:第\s*\d{1,3}\s*[卷期]|\bVol\s*\.?\s*\d|\bNo\s*\.?\s*\d)[^\n]{0,120}?\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/i.exec(head);
    if (rev) m = [rev[0], rev[1], rev[2]];
  }
  if (m) return sourced(mkDate(+m[2], EN_MON[m[1].toLowerCase()], null), '期刊卷期');
  // 只提供年度刊期时保留“年”精度，不根据期数臆造月份。
  if ((m = /((?:19|20)\d{2})\s*年\s*第\s*\d{1,3}\s*(?:卷|期)/.exec(head)))
    return sourced(mkDate(+m[1], null, null), '期刊卷期');
  if ((m = /第\s*\d{1,3}\s*卷[^\n]{0,100}?((?:19|20)\d{2})\s*年(?:\s*第\s*\d{1,3}\s*期)?/.exec(head)))
    return sourced(mkDate(+m[1], null, null), '期刊卷期');
  if ((m = /\bVol\s*\.?\s*\d[^\n]{0,100}?\b((?:19|20)\d{2})\b/i.exec(head)))
    return sourced(mkDate(+m[1], null, null), '期刊卷期');
  return null;
}
// 红头“印发”日期（支持中文数字、全角、碎空格），返回 {ts,prec:'d'} 或 null。
function stampDate(text) {
  let tail = text.length > 4000 ? text.slice(-4000) : text;
  tail = tail.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/\s+/g, '');
  const re = /([0-9〇零○O一二三四五六七八九]{2,4})年([0-9一二三四五六七八九十]{1,3})月([0-9一二三四五六七八九十]{1,3})日印发/g;
  let m, last = null;
  while ((m = re.exec(tail))) last = m;
  if (!last) return null;
  const y = /^\d+$/.test(last[1]) ? +last[1] : cnToYear(last[1]);
  return sourced(mkDate(y, cnToNum(last[2]), cnToNum(last[3])), '文末印发日期');
}
// 仅为解析归一：整段全角 ASCII（含数字字母与全角连字符 －）→半角，便于日期/期刊特征正则匹配（不影响存储/显示）。
function toHalf(s) { return (s || '').replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)); }

/* 文档类型判定（决定用哪套取时间规则）：
 *   红头  ← 文件名含发文字号〔20xx〕N号；
 *   学术期刊 ← 正文头部含期刊特征（卷/期 · Vol/No · DOI · ISSN · 收稿日期），文件名通常看不出，故看内容；
 *   其余按文件名关键词：条例/办法→法规；规程/标准/规范/指南→规范；规划/计划→规划；都不是→普通。 */
function classifyDocType(text, name) {
  const n = name || '';
  if (/〔\s*\d{2,4}\s*〕\s*\d+\s*号/.test(n) || /\[\s*\d{2,4}\s*\]\s*\d+\s*号/.test(n)) return 'red';
  const body = text || '';
  const journalZone = body.slice(0, 3500) + '\n' + body.slice(-2500);
  const issueMarker = /第\s*\d{1,3}\s*卷|第\s*\d{1,3}\s*期|\bVol\s*\.?\s*\d|\bNo\s*\.?\s*\d/i.test(journalZone);
  const strongMarker = /\bISSN\b|收稿日期|修回日期|欢迎引用/i.test(journalZone);
  const doiWithPaperStructure = /\.(?:pdf|docx?|wps|ofd)$/i.test(n)
    && /(?:\bDOI\b|doi\s*[:：])/i.test(journalZone)
    && /摘要|关键词|\bAbstract\b|\bKeywords?\b/i.test(journalZone);
  if (/(?:19|20)\d{2}\s*年第\s*\d{1,3}\s*期/.test(n)
      || issueMarker || strongMarker || doiWithPaperStructure) return 'journal';
  if (/条例|办法/.test(n)) return 'law';
  if (/技术规程|规程|标准|规范|指南/.test(n)) return 'spec';
  if (/规划|计划/.test(n)) return 'plan';
  return 'normal';
}

// 只取文档首页/末页区域：避免把正文中段提到的日期当成文档时间。
function headOf(t) { return t.slice(0, 1200); }
function tailOf(t) { return t.length > 1200 ? t.slice(-1200) : t; }

// 剔除“2025-2035年 / 2025年至2035年”这类编制期限区间——无论出现在文件名还是正文，都不能当成文档时间。
function stripPeriodRanges(s) {
  return (s || '').replace(/(?:19|20)\d{2}\s*年?\s*[-—－~∼至到]+\s*(?:19|20)\d{2}\s*年?/g, ' ');
}
// 在首页/末页里取日期（先剔除年限区间）。
function grabHead(t) { return sourced(grabDate(stripPeriodRanges(headOf(t))), '首页日期'); }
function grabTail(t) { return sourced(grabDate(stripPeriodRanges(tailOf(t))), '末页日期'); }

// 文件名里的日期：先剔除编制期限区间，再取 年月日/年月，最后退而取独立四位年份(prec='y')。
function filenameDate(name) {
  const s = stripPeriodRanges(toHalf((name || '').replace(/\.[^.]+$/, '')));
  const r = grabDate(s); if (r) return sourced(r, '文件名日期');
  const m = /(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/.exec(s);
  if (m) { const y = +m[1]; if (y >= 1949 && y <= 2100) return { ts: Date.UTC(y, 0, 1), prec: 'y', source: '文件名日期' }; }
  return null;
}

function publicationDate(text) {
  const labels = ['出版日期', '出版时间', '发表日期', '发布日期', '网络首发日期', '在线发表日期', '上线日期'];
  for (const label of labels) {
    const d = labeledDate(text, label, label);
    if (d) return d;
  }
  const m = /(?:published|available)\s+(?:online\s+)?(?:on\s+)?([\s\S]{0,32})/i.exec(text.slice(0, 4000));
  return m ? sourced(grabDate(m[1]), '在线出版日期') : null;
}

// 很多中文期刊在文末提供“欢迎引用：作者，题名[J]，期刊，2025, 17(1): ...”。
// 该年份是可靠的正式刊期，尤其可补足页眉只抽出“第17卷第1期”却丢失年份的 PDF。
function citationDate(text) {
  const zone = (text || '').slice(0, 4500) + '\n' + (text || '').slice(-4500);
  let m = /(?:欢迎引用|建议引用|引用格式|cite\s+this(?:\s+article)?)[\s\S]{0,520}?((?:19|20)\d{2})\s*[,，]\s*\d+\s*\(\s*\d+\s*\)/i.exec(zone);
  if (!m) m = /(?:欢迎引用|建议引用|引用格式)[\s\S]{0,520}?((?:19|20)\d{2})\s*年第\s*\d+\s*期/i.exec(zone);
  return m ? sourced(mkDate(+m[1], null, null), '论文规范引用') : null;
}

// 红头：印发(文末) > 首页日期 > 末页日期；绝不取正文中段。
function redDocDate(text) { return stampDate(text) || grabHead(text) || grabTail(text) || null; }
// 学术期刊：正式出版时间优先；收稿/修回只是最后兜底，不能再冒充论文刊期。
function journalDocDate(text, name) {
  return publicationDate(text) || journalIssueDate(text) || citationDate(text) || filenameDate(name)
      || labeledDate(text, '修回日期') || labeledDate(text, '修订日期') || labeledDate(text, '修改日期')
      || labeledDate(text, '收稿日期') || labeledDate(text, '来稿日期') || labeledDate(text, '投稿日期')
      || grabHead(text) || grabTail(text) || null;
}
// 法规/规范/规划/普通：文件名(排除年限区间) > 首页 > 末页；都没有 → null（渲染层回退文件 mtime）。
function genericDocDate(text, name) { return filenameDate(name) || publicationDate(text) || grabHead(text) || grabTail(text) || null; }

// 给出 文档类型 + 三套候选日期（渲染层按“当前类型”择一显示；搜索时算，不入索引，改这里不需 +EXTRACT_VERSION）。
function analyzeDoc(text, name) {
  text = toHalf(text);
  const type = classifyDocType(text, name);
  return { type, dRed: redDocDate(text), dJournal: journalDocDate(text, name), dGeneric: genericDocDate(text, name) };
}

// 兼容导出：按自动类型给出单一日期。
function parseDocDate(text, name) {
  if (!text) return null;
  const a = analyzeDoc(text, name);
  return a.type === 'red' ? a.dRed : (a.type === 'journal' ? a.dJournal : a.dGeneric);
}

// 判定命中所在段落是"正文"还是"标题/目录"
function classify(para) {
  const t = (para || '').trim();
  // Word 目录字段、超链接锚点、点线引导+页码 —— 典型目录条目
  if (/PAGEREF|_Toc|HYPERLINK|TOC \\o|\\h\b|\.{4,}\s*\d+\s*$/i.test(t)) return 'title';
  // 过短的段落多为标题/小标题
  if (t.length <= 24) return 'title';
  return 'body';
}

// 取命中处所在的"整段"：向两侧扩到换行为止，并设上限防止过长
function extractPara(text, s, e) {
  let start = text.lastIndexOf('\n', s - 1);
  start = start === -1 ? 0 : start + 1;
  let end = text.indexOf('\n', e);
  end = end === -1 ? text.length : end;
  const MAX = 1500;
  if (s - start > MAX) start = s - MAX;
  if (end - e > MAX) end = e + MAX;
  return text.slice(start, end).replace(/[ \t]+/g, ' ').trim();
}

// 把输入拆成多个关键词：空格 / 逗号 / 顿号 / 分号 都算分隔
function splitTerms(s) { return [...new Set((s || '').split(/[\s,，、;；]+/).filter(Boolean))]; }

function search(index, keyword, opts = {}) {
  keyword = (keyword || '').trim();
  if (!keyword) return [];
  const ctx = opts.ctx || 50;          // 片段上下文长度
  const maxPerDoc = opts.maxPerDoc || 5;
  const maxResults = opts.maxResults || 500;

  const terms = splitTerms(keyword);
  if (!terms.length) return [];
  const multi = terms.length > 1;      // 多关键词：文档须同时包含所有词（更聚焦）
  const lowTerms = terms.map((t) => t.toLowerCase());

  // 候选文档：逐词用倒排取其 bigram 交集，再跨词求交。
  // 单个汉字在连续中文串的索引中没有 unigram posting，因此不参与倒排过滤，
  // 改由正文 substring 校验；否则“政策”会无法命中查询“政”。
  let candidates = null;
  for (const term of terms) {
    const singleCJK = /^[一-鿿]$/.test(term);
    const toks = singleCJK ? [] : [...new Set(tokenize(term))];
    let cand = null;
    if (!toks.length) {
      cand = new Set(index.docs.map((d) => d.id));
    }
    for (const tk of toks) {
      // 旧索引的 inverted 经 JSON 还原为普通对象；若 tk 撞 Object 原型属性名(如 constructor)，
      // inverted[tk] 会取到继承属性而非数组，故用 Array.isArray 护栏，非数组按"无命中"处理。
      const posting = index.inverted[tk];
      const set = new Set(Array.isArray(posting) ? posting : []);
      cand = cand === null ? set : new Set([...cand].filter((x) => set.has(x)));
      if (cand.size === 0) break;
    }
    cand = cand || new Set();
    candidates = candidates === null ? cand : new Set([...candidates].filter((x) => cand.has(x)));
    if (candidates.size === 0) break;
  }
  if (!candidates || !candidates.size) return [];

  // 结果有总量上限，必须先从新到旧扫描；否则高频词达到上限时最新文件会被永久截掉。
  const ids = [...candidates].sort((a, b) => index.docs[b].mtime - index.docs[a].mtime);

  // 文档「类型 + 三套候选日期」按 id 缓存：同一索引内不变，避免每次按键重跑整条正则链。
  // 缓存挂在 index 对象上，索引重建会产生新对象 → 自动失效。
  const metaCache = index._docMetaCache || (index._docMetaCache = new Map());

  const rows = [];
  for (const id of ids) {
    const doc = index.docs[id];
    // v3 起正文懒加载：命中文档才从 texts.bin 读取（旧的内存内 doc.text 作兼容回退）
    const text = index.getText ? index.getText(id) : doc.text;
    if (!text) continue;
    const hay = text.toLowerCase();
    let a; // { type, dRed, dJournal, dGeneric }（按 id 缓存，跨多次搜索复用）
    if (metaCache.has(id)) a = metaCache.get(id);
    else { a = analyzeDoc(text, doc.name); metaCache.set(id, a); }
    // 随每条命中回传：自动类型 + 三套候选日期；渲染层按“当前类型(可手动改)”择一显示，手动时间再优先。
    const dfields = { docType: a.type, dRed: a.dRed, dJournal: a.dJournal, dGeneric: a.dGeneric };

    if (!multi) {
      // —— 单关键词：逐处精确定位 ——
      const kwLower = lowTerms[0];
      let from = 0, count = 0;
      while (count < maxPerDoc) {
        const pos = hay.indexOf(kwLower, from);
        if (pos === -1) break;
        const para = extractPara(text, pos, pos + terms[0].length);
        rows.push({
          name: doc.name, path: doc.path, mtime: doc.mtime, ...dfields,
          before: clean(text.slice(Math.max(0, pos - ctx), pos)),
          hit: clean(text.slice(pos, pos + terms[0].length)),
          after: clean(text.slice(pos + terms[0].length, pos + terms[0].length + ctx)),
          para, kind: classify(para)
        });
        from = pos + terms[0].length;
        count++;
        if (rows.length >= maxResults) return rows;
      }
      continue;
    }

    // —— 多关键词：文档须同时含所有词；优先取「同一段落同时出现所有词」的命中（更聚焦）——
    if (!lowTerms.every((t) => hay.includes(t))) continue; // 过滤 bigram 假阳性
    const anchor = lowTerms[0];
    let from = 0, scanned = 0, added = 0;
    const seenPara = new Set();
    while (scanned < 400 && added < maxPerDoc) {
      const pos = hay.indexOf(anchor, from);
      if (pos === -1) break;
      from = pos + anchor.length;
      scanned++;
      const para = extractPara(text, pos, pos + terms[0].length);
      const pl = para.toLowerCase();
      if (!lowTerms.every((t) => pl.includes(t))) continue; // 该段未同时含所有词，跳过
      if (seenPara.has(para)) continue;
      seenPara.add(para);
      rows.push({ name: doc.name, path: doc.path, mtime: doc.mtime, ...dfields, before: '', hit: terms[0], after: '', para, kind: classify(para) });
      added++;
      if (rows.length >= maxResults) return rows;
    }
    // 兜底：文档含所有词但无同段共现，给一条代表段，避免整篇被漏掉
    if (added === 0) {
      const pos = hay.indexOf(anchor);
      if (pos >= 0) {
        const para = extractPara(text, pos, pos + terms[0].length);
        rows.push({ name: doc.name, path: doc.path, mtime: doc.mtime, ...dfields, before: '', hit: terms[0], after: '', para, kind: classify(para) });
        if (rows.length >= maxResults) return rows;
      }
    }
  }
  return rows;
}

module.exports = { search, parseDocDate, analyzeDoc, classifyDocType };
