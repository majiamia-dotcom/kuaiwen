// 中文二元分词（bigram）：无需词典，保证"用地审批"能命中"建设用地审批"。
// 汉字串拆成相邻两字一组；英文/数字整体作为一个词。
function tokenize(text) {
  text = (text || '').toLowerCase();
  const tokens = [];
  // 抓取连续汉字串，或连续英文/数字串
  const segs = text.match(/[一-鿿]+|[a-z0-9]+/g) || [];
  for (const seg of segs) {
    if (/^[a-z0-9]+$/.test(seg)) {
      tokens.push(seg);
    } else {
      if (seg.length === 1) tokens.push(seg);
      for (let i = 0; i < seg.length - 1; i++) {
        tokens.push(seg.slice(i, i + 2));
      }
    }
  }
  return tokens;
}

module.exports = { tokenize };
