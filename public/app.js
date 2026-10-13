import { STYLES, format, toHtml, toPlain, sortKey } from "./formatters.js";

const $ = (id) => document.getElementById(id);
const STORE = "citefmt.v1";
const EXAMPLES = ["https://doi.org/10.1038/nature14539", "https://en.wikipedia.org/wiki/Citation"];

const state = { items: [], style: "apa", theme: "" };
try { Object.assign(state, JSON.parse(localStorage.getItem(STORE) || "{}")); } catch { /* storage unavailable */ }
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* ignore */ } };

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const authorsToText = (as) => as.map((a) => (a.name ? a.name : `${a.family}, ${a.given}`)).join("; ");
const textToAuthors = (t) => t.split(";").map((s) => s.trim()).filter(Boolean).map((s) => {
  if (s.includes(",")) { const [family, given] = s.split(/,\s*(.*)/s); return { family: family.trim(), given: (given || "").trim() }; }
  return { name: s };
});
const cite = (it, style = state.style) => format(style, it.meta, it.accessed);

// ---- theme ----
function applyTheme() {
  if (state.theme) document.documentElement.dataset.theme = state.theme; else delete document.documentElement.dataset.theme;
}

// ---- rendering ----
function orderedItems() {
  // IEEE is numbered in order of first citation; the other styles are alphabetical.
  if (state.style === "ieee") return state.items;
  return [...state.items].sort((a, b) => sortKey(a.meta).localeCompare(sortKey(b.meta), "ja"));
}

function missingWarning(m) {
  const w = [];
  if (!m.title) w.push("タイトル");
  if (!m.authors.length) w.push("著者");
  if (!m.date) w.push("公開日");
  return w.length ? `${w.join("・")}が見つかりませんでした。「編集」で補ってください。` : "";
}

function paint(el, it, n) {
  const text = cite(it);
  const isBib = state.style === "bibtex";
  const prefix = state.style === "ieee" ? `[${n}] ` : "";
  const body = el.querySelector(".cite");
  if (isBib) body.textContent = toPlain(text); else body.innerHTML = prefix + toHtml(text);
}

function render() {
  const list = $("list");
  $("empty").hidden = state.items.length > 0;
  $("toolbar").hidden = state.items.length === 0;
  document.querySelectorAll("#styles button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.style === state.style)));
  list.replaceChildren(...orderedItems().map((it, i) => buildItem(it, i + 1)));
}

const FIELDS = [
  ["title", "タイトル"], ["authors", "著者", "姓, 名; 姓, 名 の形式。団体名はそのまま"],
  ["date", "公開日", "YYYY-MM-DD(月や日が不明なら YYYY-MM / YYYY)"], ["siteName", "サイト名"],
  ["journal", "雑誌名", "入れると論文書式になります"], ["vip", "巻/号/頁", "12/3/45-67"],
  ["doi", "DOI"], ["accessed", "閲覧日", "YYYY-MM-DD"],
];

function fieldValue(it, k) {
  if (k === "authors") return authorsToText(it.meta.authors);
  if (k === "vip") return [it.meta.volume, it.meta.issue, it.meta.pages].some(Boolean) ? [it.meta.volume, it.meta.issue, it.meta.pages].join("/") : "";
  if (k === "accessed") return it.accessed;
  return it.meta[k] || "";
}
function setField(it, k, v) {
  v = v.trim();
  if (k === "authors") it.meta.authors = textToAuthors(v);
  else if (k === "vip") { const [volume = "", issue = "", pages = ""] = v.split("/").map((s) => s.trim()); Object.assign(it.meta, { volume, issue, pages }); }
  else if (k === "accessed") it.accessed = v;
  else it.meta[k] = v;
  it.meta.type = it.meta.journal ? "article" : "webpage";
}

function buildItem(it, n) {
  const el = document.createElement("article");
  el.className = "item";
  const warn = missingWarning(it.meta);
  el.innerHTML = `
    <${state.style === "bibtex" ? "pre" : "p"} class="cite"></${state.style === "bibtex" ? "pre" : "p"}>
    ${warn ? `<div class="warn"></div>` : ""}
    <div class="src"></div>
    <div class="actions">
      <button class="small" data-a="copy">コピー</button>
      <button class="small" data-a="edit" aria-expanded="false">編集</button>
      <button class="small danger" data-a="del">削除</button>
    </div>
    <div class="edit" hidden></div>`;
  if (warn) el.querySelector(".warn").textContent = warn;
  el.querySelector(".src").textContent = it.meta.url;
  paint(el, it, n);

  const edit = el.querySelector(".edit");
  for (const [k, label, hint] of FIELDS) {
    const id = `f-${it.id}-${k}`;
    const lab = document.createElement("label"); lab.htmlFor = id; lab.textContent = label;
    const inp = document.createElement("input"); inp.id = id; inp.type = "text"; inp.value = fieldValue(it, k);
    inp.addEventListener("input", () => { setField(it, k, inp.value); save(); paint(el, it, n); });
    edit.append(lab, inp);
    if (hint) { const h = document.createElement("div"); h.className = "hint"; h.textContent = hint; edit.append(h); }
  }

  el.addEventListener("click", async (e) => {
    const a = e.target.closest("button")?.dataset.a;
    if (!a) return;
    if (a === "del") { state.items = state.items.filter((x) => x.id !== it.id); save(); render(); }
    if (a === "edit") { edit.hidden = !edit.hidden; e.target.setAttribute("aria-expanded", String(!edit.hidden)); }
    if (a === "copy") flash(e.target, await copy(state.style === "bibtex" ? "" : toHtml(prefixed(it, n)), toPlain(prefixed(it, n))));
  });
  return el;
}
const prefixed = (it, n) => (state.style === "ieee" ? `[${n}] ` : "") + cite(it);

// ---- clipboard / download ----
async function copy(html, plain) {
  try {
    if (html && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      })]);
    } else await navigator.clipboard.writeText(plain);
    return true;
  } catch { return false; }
}
function flash(btn, ok) {
  const old = btn.dataset.label || btn.textContent;
  btn.dataset.label = old;
  btn.textContent = ok ? "コピーしました ✓" : "コピーできませんでした";
  setTimeout(() => (btn.textContent = old), 1500);
}
function download(name, text, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- fetching ----
function setMsg(t, err = false) { const m = $("msg"); m.textContent = t; m.className = err ? "err" : ""; }

async function fetchOne(url) {
  const r = await fetch(`/api/cite?url=${encodeURIComponent(url)}`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

async function addUrls(urls) {
  urls = [...new Set(urls)];
  const known = new Set(state.items.map((i) => i.meta.url));
  const failed = [];
  let done = 0;
  const queue = urls.slice();
  const worker = async () => {
    for (let url; (url = queue.shift()); ) {
      try {
        const meta = await fetchOne(url);
        if (known.has(meta.url)) { done++; continue; }
        known.add(meta.url);
        state.items.push({ id: crypto.randomUUID(), meta, accessed: today() });
      } catch (e) { failed.push(`${url} — ${e.message}`); }
      setMsg(`取得中… ${++done}/${urls.length}`);
    }
  };
  setMsg(`取得中… 0/${urls.length}`);
  await Promise.all([worker(), worker(), worker()]);
  save(); render();
  if (failed.length) setMsg(`取得できなかった URL:\n${failed.join("\n")}`, true); else setMsg("");
  return failed.length === 0;
}

// ---- wiring ----
$("f").addEventListener("submit", async (e) => {
  e.preventDefault();
  const urls = $("urls").value.split(/[\s,]+/).filter(Boolean);
  if (!urls.length) return;
  $("go").disabled = true;
  try { if (await addUrls(urls)) $("urls").value = ""; } finally { $("go").disabled = false; }
});
$("urls").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("f").requestSubmit(); });

$("examples").append(...EXAMPLES.map((u) => {
  const b = document.createElement("button"); b.type = "button"; b.textContent = u.replace(/^https:\/\//, "");
  b.addEventListener("click", () => { $("urls").value = u; $("f").requestSubmit(); });
  return b;
}));

$("styles").append(...Object.entries(STYLES).map(([k, s]) => {
  const b = document.createElement("button"); b.type = "button"; b.dataset.style = k; b.textContent = s.label;
  b.addEventListener("click", () => { state.style = k; save(); render(); });
  return b;
}));

function listText(kind) {
  const items = orderedItems();
  if (kind === "bib") return items.map((it) => cite(it, "bibtex"));
  return items.map((it, i) => prefixed(it, i + 1));
}
$("copy-all").addEventListener("click", async (e) => {
  const lines = listText("txt");
  const sep = state.style === "bibtex" ? "\n\n" : "\n";
  const html = state.style === "bibtex" ? "" : lines.map((l) => `<p style="padding-left:2em;text-indent:-2em">${toHtml(l)}</p>`).join("");
  flash(e.currentTarget, await copy(html, lines.map(toPlain).join(sep)));
});
$("dl-txt").addEventListener("click", () => download("references.txt", listText("txt").map(toPlain).join(state.style === "bibtex" ? "\n\n" : "\n")));
$("dl-bib").addEventListener("click", () => download("references.bib", listText("bib").map(toPlain).join("\n\n"), "application/x-bibtex"));
$("clear").addEventListener("click", () => { if (confirm("リストをすべて削除しますか?")) { state.items = []; save(); render(); } });
$("theme").addEventListener("click", () => {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const cur = state.theme || (dark ? "dark" : "light");
  state.theme = cur === "dark" ? "light" : "dark"; save(); applyTheme();
});

applyTheme();
render();
