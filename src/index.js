// Cloudflare Worker: /api/cite?url=... fetches a page and extracts citation metadata.
// Everything else is served from ./public via the ASSETS binding.

const MAX_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 8000;

export default {
  async fetch(request, env, ctx) {
    const { pathname, searchParams } = new URL(request.url);
    if (pathname === "/api/cite") {
      // Only our own pages should use this endpoint (blocks casual cross-site abuse).
      if (request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "forbidden" }, 403);
      const cache = caches.default;
      const hit = await cache.match(request);
      if (hit) return hit;
      const res = await handleCite(searchParams.get("url"));
      if (res.ok) ctx.waitUntil(cache.put(request, res.clone()));
      return res;
    }
    return env.ASSETS.fetch(request);
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 ? "public, max-age=3600" : "no-store",
    },
  });
}

function parseTarget(raw) {
  if (!raw) return null;
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(u.protocol)) return null;
  const h = u.hostname;
  // Workers cannot reach private networks, but reject obvious local targets anyway.
  if (h === "localhost" || h.endsWith(".local") || /^(\d+\.){3}\d+$/.test(h) || h.includes(":")) return null;
  return u;
}

async function handleCite(raw) {
  const target = parseTarget(raw);
  if (!target) return json({ error: "有効な http(s) URL を指定してください" }, 400);

  // DOI URLs: Crossref gives much better metadata than scraping the publisher page.
  const doi = extractDoi(target.href);
  if (doi) {
    const meta = await fromCrossref(doi);
    if (meta) return json({ ...meta, url: target.href });
  }

  let res;
  try {
    res = await fetch(target.href, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; CitationFormatter/0.1)",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } catch {
    return json({ error: "ページを取得できませんでした" }, 502);
  }
  const type = res.headers.get("content-type") || "";
  if (!res.ok) return json({ error: `ページの取得に失敗しました (HTTP ${res.status})` }, 502);
  if (!/html|xml/i.test(type)) return json({ error: "HTML 以外のページには未対応です" }, 415);

  const meta = await extractMetadata(res, target);
  if (meta.doi && !meta.journal) {
    const cr = await fromCrossref(meta.doi);
    if (cr) Object.assign(meta, Object.fromEntries(Object.entries(cr).filter(([, v]) => v && !(Array.isArray(v) && !v.length))));
  }
  return json(meta);
}

function extractDoi(s) {
  const m = /10\.\d{4,9}\/[^\s?#]+/i.exec(decodeURIComponent(s));
  return m && /doi\.org\//i.test(s) ? m[0] : null;
}

async function fromCrossref(doi) {
  try {
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": "CitationFormatter/0.1 (mailto:noreply@example.com)" },
    });
    if (!r.ok) return null;
    const w = (await r.json()).message;
    const dp = (w.issued?.["date-parts"] || w.published?.["date-parts"] || [[]])[0].filter(Boolean);
    return {
      type: w.type === "journal-article" ? "article" : "webpage",
      title: [].concat(w.title || [])[0] || "",
      authors: (w.author || []).map((a) => (a.family ? { family: a.family, given: a.given || "" } : { name: a.name || "" })),
      date: dp.map((n, i) => (i ? String(n).padStart(2, "0") : String(n))).join("-"),
      journal: [].concat(w["container-title"] || [])[0] || "",
      publisher: w.publisher || "",
      volume: w.volume || "",
      issue: w.issue || "",
      pages: w.page || "",
      doi: w.DOI || doi,
      url: w.URL || `https://doi.org/${doi}`,
    };
  } catch {
    return null;
  }
}

async function extractMetadata(res, target) {
  const metas = []; // [key, value]
  const ld = [];
  let title = "";
  let canonical = "";
  let lang = "";
  let ldBuf = "";
  let titleBuf = "";

  const rewriter = new HTMLRewriter()
    .on("html", { element(e) { lang = e.getAttribute("lang") || ""; } })
    .on("meta", {
      element(e) {
        const k = (e.getAttribute("name") || e.getAttribute("property") || e.getAttribute("itemprop") || "").toLowerCase();
        const v = e.getAttribute("content");
        if (k && v) metas.push([k, v.trim()]);
      },
    })
    .on("link[rel='canonical']", { element(e) { canonical = e.getAttribute("href") || ""; } })
    .on("title", { text(t) { titleBuf += t.text; if (t.lastInTextNode) { title ||= titleBuf.trim(); titleBuf = ""; } } })
    .on("script[type='application/ld+json']", {
      text(t) { ldBuf += t.text; if (t.lastInTextNode) { ld.push(ldBuf); ldBuf = ""; } },
    });

  // Cap the body so a huge page can't blow the CPU/memory budget.
  const capped = new Response(capStream(res.body, MAX_BYTES), { headers: res.headers });
  await rewriter.transform(capped).arrayBuffer();

  const all = (k) => metas.filter(([key]) => key === k).map(([, v]) => v);
  const one = (...ks) => { for (const k of ks) { const v = all(k)[0]; if (v) return v; } return ""; };

  const ldObj = parseLd(ld);

  const authorsRaw = all("citation_author").length
    ? all("citation_author")
    : all("dc.creator").length
      ? all("dc.creator")
      : all("article:author").filter((v) => !/^https?:/.test(v)).length
        ? all("article:author").filter((v) => !/^https?:/.test(v))
        : all("author").length
          ? all("author")
          : ldObj.authors;

  const date = one(
    "citation_publication_date", "citation_date", "citation_online_date", "dc.date", "dc.date.issued",
    "article:published_time", "og:article:published_time", "datepublished", "date", "pubdate",
  ) || ldObj.date;

  return {
    type: one("citation_journal_title") ? "article" : "webpage",
    title: cleanTitle(
      one("citation_title", "dc.title", "og:title", "twitter:title") || ldObj.title || title,
      one("og:site_name", "application-name"), ldObj.site, target.hostname.replace(/^www\./, "").split(".").slice(-2, -1)[0],
    ),
    authors: authorsRaw.flatMap(splitAuthors).map(parseName),
    date: normalizeDate(date),
    siteName: one("og:site_name", "application-name") || ldObj.site || target.hostname.replace(/^www\./, ""),
    journal: one("citation_journal_title", "prism.publicationname"),
    publisher: one("citation_publisher", "dc.publisher"),
    volume: one("citation_volume", "prism.volume"),
    issue: one("citation_issue", "prism.number"),
    pages: [one("citation_firstpage", "prism.startingpage"), one("citation_lastpage", "prism.endingpage")].filter(Boolean).join("-"),
    doi: (one("citation_doi", "dc.identifier.doi", "prism.doi") || "").replace(/^(doi:|https?:\/\/(dx\.)?doi\.org\/)/i, ""),
    url: canonical && /^https?:/i.test(canonical) ? canonical : res.url || target.href,
    lang,
  };
}

function capStream(body, max) {
  let n = 0;
  return body.pipeThrough(new TransformStream({
    transform(chunk, ctl) {
      n += chunk.byteLength;
      if (n > max) { ctl.terminate(); return; }
      ctl.enqueue(chunk);
    },
  }));
}

function parseLd(blocks) {
  const out = { authors: [], date: "", title: "", site: "" };
  const nodes = [];
  for (const b of blocks) {
    try {
      const j = JSON.parse(b);
      for (const n of [].concat(j["@graph"] || j)) nodes.push(n);
    } catch { /* ignore malformed JSON-LD */ }
  }
  const article = nodes.find((n) => /Article|BlogPosting|NewsArticle|WebPage/i.test([].concat(n?.["@type"] || []).join(",")));
  if (!article) return out;
  out.title = typeof article.headline === "string" ? article.headline : "";
  out.date = article.datePublished || "";
  out.authors = [].concat(article.author || []).map((a) => (typeof a === "string" ? a : a?.name)).filter(Boolean);
  out.site = article.publisher?.name || "";
  return out;
}

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

function normalizeDate(s) {
  if (!s) return "";
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{4})[-/.](\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = /^(\d{4})$/.exec(s.trim());
  if (m) return m[1];
  const d = new Date(s);
  return isNaN(d) ? "" : d.toISOString().slice(0, 10);
}
