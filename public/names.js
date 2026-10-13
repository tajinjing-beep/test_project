// Shared by the Worker (scraped bylines) and the browser (manual edits).
export function splitAuthors(s) {
  // "A, B and C" style bylines; "Last, First" is handled in parseName so only split on ; / & / and.
  return s.split(/\s*(?:;|&|、| and )\s*/i).map((x) => x.trim()).filter(Boolean);
}

// "Page title | Site Name" → "Page title" (only when the suffix really is the site name).
export function cleanTitle(t, ...sites) {
  t = (t || "").replace(/\s+/g, " ").trim();
  const names = sites.filter(Boolean).map((x) => x.toLowerCase());
  const m = /^(.*\S)\s+[|\-–—:・]\s+(.+)$/.exec(t);
  if (m && names.includes(m[2].toLowerCase())) return m[1];
  const m2 = /^(.+?)\s*[|\-–—:・]\s+(.*\S)$/.exec(t);
  if (m2 && names.includes(m2[1].toLowerCase())) return m2[2];
  return t;
}

const CJK = /[\u3040-\u30ff\u3400-\u9fff]/;

export function parseName(s) {
  s = s.replace(/^by\s+/i, "").replace(/^著者[:：]\s*/, "").trim();
  if (CJK.test(s)) {
    // "山田 太郎" / "山田　太郎" / "山田・太郎" → family + given; a single token is kept whole.
    const parts = s.split(/[\s\u3000・]+/).filter(Boolean);
    return parts.length === 2 ? { family: parts[0], given: parts[1] } : { name: s };
  }
  if (s.includes(",")) {
    const [family, given] = s.split(/,\s*(.*)/s);
    return { family: family.trim(), given: (given || "").trim() };
  }
  const parts = s.split(/\s+/);
  // Single token or obvious organization → keep as institutional name.
  if (parts.length === 1 || parts.length > 4 || /\b(inc|ltd|llc|corp|university|institute|association|agency|ministry|news|times|group|contributors|team|staff|editors|editorial|foundation|project|projects|society|council|committee|department|press)\b/i.test(s)) return { name: s };
  return { family: parts.at(-1), given: parts.slice(0, -1).join(" ") };
}


export function normalizeDate(s) {
  if (!s) return "";
  // 2024年1月5日 / 2024年1月 / 2024年
  const j = /^(\d{4})年(?:\s*(\d{1,2})月)?(?:\s*(\d{1,2})日)?/.exec(s.trim());
  if (j) return [j[1], j[2] && j[2].padStart(2, "0"), j[2] && j[3] && j[3].padStart(2, "0")].filter(Boolean).join("-");
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{4})[-/.](\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = /^(\d{4})$/.exec(s.trim());
  if (m) return m[1];
  const d = new Date(s);
  return isNaN(d) ? "" : d.toISOString().slice(0, 10);
}

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»" };

// HTMLRewriter hands back raw attribute/text values, so decode entities ourselves.
export function decodeEntities(s) {
  return (s || "").replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, dec, hex, name) => {
    if (name) return NAMED[name.toLowerCase()] ?? m;
    const cp = dec ? parseInt(dec, 10) : parseInt(hex, 16);
    return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });
}
