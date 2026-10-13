// Pure citation formatters. Italic spans are marked with I_OPEN / I_CLOSE control chars
// so the same string can be rendered as plain text, HTML, or BibTeX.

export const I_OPEN = "\u0001";
export const I_CLOSE = "\u0002";
const it = (s) => (s ? I_OPEN + s + I_CLOSE : "");

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON_ABBR = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

function parseDate(s) {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(s || "");
  if (!m) return null;
  return { y: +m[1], m: m[2] ? +m[2] : 0, d: m[3] ? +m[3] : 0 };
}

const initials = (given, sep = ". ", end = ".") =>
  given.split(/[\s.]+/).filter(Boolean).map((p) => p[0].toUpperCase() + end).join(sep === ". " ? " " : sep);

const endDot = (s) => (/[.?!]$/.test(s) ? s : s + ".");

// oxford: put a comma before the conjunction (always for 3+; for 2 only when `twoComma`).
function joinList(items, word, { oxford = false, twoComma = false } = {}) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]}${twoComma ? "," : ""} ${word} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}${oxford ? "," : ""} ${word} ${items.at(-1)}`;
}

// ---- Author renderers ----
const aLastInit = (a) => (a.name ? a.name : `${a.family}, ${initials(a.given)}`.replace(/,\s*$/, ""));
const aLastFirst = (a) => (a.name ? a.name : `${a.family}, ${a.given}`.replace(/,\s*$/, ""));
const aFirstLast = (a) => (a.name ? a.name : `${a.given} ${a.family}`.trim());
const aInitLast = (a) => (a.name ? a.name : `${initials(a.given)} ${a.family}`.trim());

function apa(c) {
  const au = c.authors || [];
  let who;
  if (au.length === 0) who = "";
  else if (au.length <= 20) who = joinList(au.map(aLastInit), "&", { oxford: true, twoComma: true });
  else who = au.slice(0, 19).map(aLastInit).join(", ") + ", . . . " + aLastInit(au.at(-1));
  const d = parseDate(c.date);
  const isArticle = c.type === "article" && c.journal;
  const date = d ? `(${d.y}${!isArticle && d.m ? `, ${MONTHS[d.m - 1]}${d.d ? " " + d.d : ""}` : ""})` : "(n.d.)";
  const link = c.doi ? `https://doi.org/${c.doi}` : c.url;
  let out;
  if (isArticle) {
    const vol = c.volume ? `${it(c.volume)}${c.issue ? `(${c.issue})` : ""}` : "";
    const src = [it(c.journal), vol, c.pages].filter(Boolean).join(", ");
    out = [who && endDot(who), endDot(date), endDot(c.title), endDot(src), link].filter(Boolean).join(" ");
  } else {
    const site = c.siteName && c.siteName !== c.authors?.[0]?.name ? endDot(c.siteName) : "";
    out = who
      ? [endDot(who), endDot(date), endDot(it(c.title)), site, link].filter(Boolean).join(" ")
      : [endDot(it(c.title)), endDot(date), site, link].filter(Boolean).join(" ");
  }
  return out;
}

function mla(c, acc) {
  const au = c.authors || [];
  let who = "";
  if (au.length === 1) who = aLastFirst(au[0]);
  else if (au.length === 2) who = `${aLastFirst(au[0])}, and ${aFirstLast(au[1])}`;
  else if (au.length >= 3) who = `${aLastFirst(au[0])}, et al`;
  const d = parseDate(c.date);
  const date = d ? [d.d || "", d.m ? MON_ABBR[d.m - 1] : "", d.y].filter(Boolean).join(" ") : "";
  const link = (c.doi ? `https://doi.org/${c.doi}` : c.url).replace(/^https?:\/\//, "");
  const a = parseDate(acc);
  const accessed = a ? `Accessed ${a.d} ${MON_ABBR[a.m - 1]} ${a.y}` : "";
  if (c.type === "article" && c.journal) {
    const parts = [it(c.journal), c.volume && `vol. ${c.volume}`, c.issue && `no. ${c.issue}`, date, c.pages && `pp. ${c.pages}`, link];
    return [who && endDot(who), endDot(`“${endDot(c.title).replace(/\.$/, "")}.”`.replace(/\.”\.$/, ".”")), endDot(parts.filter(Boolean).join(", ")), accessed && endDot(accessed)].filter(Boolean).join(" ");
  }
  const parts = [it(c.siteName), date, link].filter(Boolean).join(", ");
  return [who && endDot(who), `“${c.title.replace(/[.]$/, "")}.”`, endDot(parts), accessed && endDot(accessed)].filter(Boolean).join(" ");
}

function chicago(c, acc) {
  const au = c.authors || [];
  const names = au.slice(0, au.length > 10 ? 7 : au.length).map((x, i) => (i ? aFirstLast(x) : aLastFirst(x)));
  const who = au.length > 10 ? names.join(", ") + ", et al" : joinList(names, "and", { oxford: true, twoComma: true });
  const d = parseDate(c.date);
  const date = d ? `${d.m ? MONTHS[d.m - 1] + " " : ""}${d.d ? d.d + ", " : ""}${d.y}` : "";
  const link = c.doi ? `https://doi.org/${c.doi}` : c.url;
  const a = parseDate(acc);
  if (c.type === "article" && c.journal) {
    const src = [it(c.journal), c.volume && `${c.volume}${c.issue ? `, no. ${c.issue}` : ""}`].filter(Boolean).join(" ");
    const when = d ? `(${d.y})` : "";
    return [who && endDot(who), `“${c.title.replace(/[.]$/, "")}.”`, [src, when].filter(Boolean).join(" ") + (c.pages ? `: ${c.pages}` : "") + ".", link + "."].filter(Boolean).join(" ");
  }
  const accessed = !d && a ? `Accessed ${MONTHS[a.m - 1]} ${a.d}, ${a.y}.` : "";
  return [who && endDot(who), `“${c.title.replace(/[.]$/, "")}.”`, c.siteName && endDot(it(c.siteName)), date && endDot(date), accessed, endDot(link)].filter(Boolean).join(" ");
}

function harvard(c, acc) {
  const au = c.authors || [];
  let who = "";
  if (au.length >= 4) who = aLastInit(au[0]) + " et al.";
  else who = joinList(au.map(aLastInit), "and");
  const d = parseDate(c.date);
  const year = d ? d.y : "n.d.";
  const link = c.doi ? `https://doi.org/${c.doi}` : c.url;
  const a = parseDate(acc);
  const accessed = a ? `(Accessed: ${a.d} ${MONTHS[a.m - 1]} ${a.y})` : "";
  if (c.type === "article" && c.journal) {
    const vi = c.volume ? `${c.volume}${c.issue ? `(${c.issue})` : ""}` : "";
    return `${who ? who + " " : ""}(${year}) ‘${c.title}’, ${[it(c.journal), vi, c.pages && `pp. ${c.pages}`].filter(Boolean).join(", ")}. Available at: ${link} ${accessed}`.replace(/\s+$/, "") + (accessed ? "." : "");
  }
  const head = who ? `${who} (${year}) ` : `${it(c.title)} (${year}) `;
  const body = who ? `${it(c.title)}. ` : "";
  return `${head}${body}${c.siteName ? c.siteName + ". " : ""}Available at: ${link} ${accessed}`.replace(/\s+$/, "") + (accessed ? "." : "");
}

function ieee(c, acc) {
  const au = c.authors || [];
  let who = au.length > 6 ? aInitLast(au[0]) + " et al." : joinList(au.map(aInitLast), "and", { oxford: true });
  const d = parseDate(c.date);
  const link = c.doi ? `doi: ${c.doi}` : `[Online]. Available: ${c.url}`;
  const a = parseDate(acc);
  const accessed = a ? ` (accessed ${MON_ABBR[a.m - 1]} ${a.d}, ${a.y}).` : "";
  if (c.type === "article" && c.journal) {
    const parts = [it(c.journal), c.volume && `vol. ${c.volume}`, c.issue && `no. ${c.issue}`, c.pages && `pp. ${c.pages}`, d && `${d.m ? MON_ABBR[d.m - 1] + " " : ""}${d.y}`, link];
    return `${who ? who + ", " : ""}“${c.title},” ${parts.filter(Boolean).join(", ")}.`;
  }
  const when = d ? `${d.m ? MON_ABBR[d.m - 1] + " " : ""}${d.d ? d.d + ", " : ""}${d.y}` : "";
  return `${who ? who + ", " : ""}“${c.title},” ${[it(c.siteName), when].filter(Boolean).join(", ")}${c.siteName || when ? ". " : ""}[Online]. Available: ${c.url}${accessed || "."}`;
}

function bibtex(c, acc) {
  const au = c.authors || [];
  const d = parseDate(c.date);
  const first = au[0]?.family || au[0]?.name || c.siteName || "ref";
  const key = (first.replace(/[^A-Za-z0-9]/g, "") || "ref") + (d ? d.y : "nd");
  const names = au.map((a) => (a.name ? `{${a.name}}` : `${a.family}, ${a.given}`)).join(" and ");
  const a = parseDate(acc);
  const fields = c.type === "article" && c.journal
    ? [["author", names], ["title", c.title], ["journal", c.journal], ["year", d?.y], ["volume", c.volume], ["number", c.issue], ["pages", c.pages?.replace("-", "--")], ["doi", c.doi], ["url", c.url]]
    : [["author", names], ["title", c.title], ["year", d?.y], ["month", d?.m ? MON_ABBR[d.m - 1].replace(".", "").toLowerCase().slice(0, 3) : ""], ["url", c.url], ["note", a ? `Accessed: ${a.y}-${String(a.m).padStart(2, "0")}-${String(a.d).padStart(2, "0")}` : ""], ["howpublished", c.siteName && `\\url{${c.url}}`]];
  const body = fields.filter(([, v]) => v).map(([k, v]) => `  ${k} = {${String(v).replace(/([&%$#_])/g, "\\$1")}}`).join(",\n");
  return `@${c.type === "article" && c.journal ? "article" : "misc"}{${key},\n${body}\n}`;
}

export const STYLES = {
  apa: { label: "APA 7th", fn: (c) => apa(c) },
  mla: { label: "MLA 9th", fn: mla },
  chicago: { label: "Chicago (notes-bibliography)", fn: chicago },
  harvard: { label: "Harvard", fn: harvard },
  ieee: { label: "IEEE", fn: ieee },
  bibtex: { label: "BibTeX", fn: bibtex },
};

export const toPlain = (s) => s.replaceAll(I_OPEN, "").replaceAll(I_CLOSE, "");
const esc = (s) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
export const toHtml = (s) => esc(s).replaceAll(I_OPEN, "<i>").replaceAll(I_CLOSE, "</i>");

export function format(style, c, accessedISO) {
  return STYLES[style].fn(c, accessedISO);
}
