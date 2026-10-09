function cleanText(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).replace(/\u00a0/g, ' ').trim();
  return v || null;
}

function parsePrice(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;

  let text = String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/TND|DT|TTC/gi, '')
    .trim();

  if (text.includes(',')) {
    // European/Tunisian format: "1.234,99" or "1 234,99"
    // dot/space = thousands separator, comma = decimal separator
    text = text.replace(/[\s.]/g, '').replace(',', '.');
  }

  text = text.replace(/[^0-9.]/g, '');

  const parsed = parseFloat(text);
  return Number.isNaN(parsed) ? null : parsed;
}

function uniqueByUrl(items) {
  const seen = new Set();
  const results = [];

  for (const item of items || []) {
    if (!item || !item.url) continue;
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    results.push(item);
  }

  return results;
}

module.exports = {
  cleanText,
  parsePrice,
  uniqueByUrl,
};