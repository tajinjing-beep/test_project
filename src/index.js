import { cleanTitle, decodeEntities, normalizeDate, parseName, splitAuthors } from "../public/names.js";

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
      // Only cache misses cost upstream fetches, so only they are rate limited.
      if (env.RATE_LIMITER) {
        const key = request.headers.get("cf-connecting-ip") || "anon";
        const { success } = await env.RATE_LIMITER.limit({ key });
        if (!success) return json({ error: "リクエストが多すぎます。しばらくしてからもう一度お試しください" }, 429);
      }
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

  // arxiv.org/pdf/ID(.pdf) → the abstract page, which carries the metadata.
  const ax = /^https?:\/\/(?:www\.)?arxiv\.org\/pdf\/([^?#]+?)(?:v\d+)?(?:\.pdf)?$/i.exec(target.href);
  if (ax) target.href = `https://arxiv.org/abs/${ax[1]}`;

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
  if (/pdf/i.test(type) || /\.pdf($|[?#])/i.test(target.pathname)) return json(await extractPdf(res, target));
  if (!/html|xml/i.test(type)) return json({ error: "HTML と PDF 以外には未対応です" }, 415);

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
  const times = [];
  let ldBuf = "";
  let titleBuf = "";

  const rewriter = new HTMLRewriter()
    .on("html", { element(e) { lang = e.getAttribute("lang") || ""; } })
    .on("meta", {
      element(e) {
        const k = (e.getAttribute("name") || e.getAttribute("property") || e.getAttribute("itemprop") || "").toLowerCase();
        const v = e.getAttribute("content");
        if (k && v) metas.push([k, decodeEntities(v).trim()]);
      },
    })
    // Collect <time> candidates; pickTime decides which (if any) is trustworthy as a publication date.
    .on("time[datetime]", {
      element(e) {
        const strict = e.hasAttribute("itemprop") || e.hasAttribute("pubdate") || /\b(published|entry-date|posted)\b/.test(e.getAttribute("class") || "");
        times.push({ v: e.getAttribute("datetime"), strict });
      },
    })
    .on("link[rel='canonical']", { element(e) { canonical = e.getAttribute("href") || ""; } })
    .on("title", { text(t) { titleBuf += t.text; if (t.lastInTextNode) { title ||= decodeEntities(titleBuf).trim(); titleBuf = ""; } } })
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
  ) || ldObj.date || pickTime(times, one("og:type") === "article");

  const arxiv = one("citation_arxiv_id") || (/arxiv\.org$/.test(target.hostname) ? (/\/abs\/(.+)$/.exec(target.pathname) || [])[1] || "" : "");

  return {
    type: one("citation_journal_title") ? "article" : "webpage",
    arxiv,
    title: cleanTitle(
      one("citation_title", "dc.title", "og:title", "twitter:title") || ldObj.title || title,
      one("og:site_name", "application-name"), ldObj.site, target.hostname.replace(/^www\./, "").split(".").slice(-2, -1)[0],
    ),
    authors: authorsRaw.flatMap(splitAuthors).map(parseName),
    date: normalizeDate(date),
    siteName: arxiv ? "arXiv" : one("og:site_name", "application-name") || ldObj.site || target.hostname.replace(/^www\./, ""),
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


// Best-effort PDF metadata: reads the Info dictionary / XMP if they are stored uncompressed.
async function extractPdf(res, target) {
  const buf = new Uint8Array(await new Response(capStream(res.body, 4_000_000)).arrayBuffer());
  const text = new TextDecoder("latin1").decode(buf);
  const info = (key) => {
    const m = new RegExp(`/${key}\\s*(\\((?:\\\\.|[^\\\\)])*\\)|<[0-9A-Fa-f\\s]+>)`).exec(text);
    return m ? decodePdfString(m[1]) : "";
  };
  const xmp = (tag) => {
    const m = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<rdf:li[^>]*>([^<]+)<`).exec(text);
    return m ? m[1].trim() : "";
  };
  const title = info("Title") || xmp("dc:title");
  const author = info("Author") || xmp("dc:creator");
  const cd = /\/CreationDate\s*\(D:(\d{4})(\d{2})?(\d{2})?/.exec(text);
  const fileName = decodeURIComponent(target.pathname.split("/").pop() || "").replace(/\.pdf$/i, "");
  return {
    type: "webpage",
    pdf: true,
    title: cleanTitle(title, target.hostname) || fileName || target.hostname,
    authors: author ? splitAuthors(author).map(parseName) : [],
    date: cd ? normalizeDate([cd[1], cd[2], cd[3]].filter(Boolean).join("-")) : "",
    siteName: target.hostname.replace(/^www\./, ""),
    journal: "", publisher: "", volume: "", issue: "", pages: "", doi: "",
    url: res.url || target.href,
    lang: "",
  };
}

function decodePdfString(raw) {
  let bytes;
  if (raw.startsWith("<")) {
    const hex = raw.slice(1, -1).replace(/\s+/g, "");
    bytes = Uint8Array.from(hex.match(/../g) || [], (h) => parseInt(h, 16));
  } else {
    const body = raw.slice(1, -1).replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_, c) => {
      if (/^[0-7]/.test(c)) return String.fromCharCode(parseInt(c, 8));
      return { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" }[c] ?? (/^\r?\n$/.test(c) ? "" : c);
    });
    bytes = Uint8Array.from(body, (ch) => ch.charCodeAt(0) & 0xff);
  }
  const bom = bytes[0] === 0xfe && bytes[1] === 0xff;
  const out = (bom ? new TextDecoder("utf-16be").decode(bytes.slice(2)) : new TextDecoder("latin1").decode(bytes)).replace(/\0/g, "").trim();
  // Encrypted PDFs yield garbage; drop anything containing control characters.
  return /[\u0001-\u0008\u000e-\u001f\u007f-\u009f\ufffd]/.test(out) ? "" : out;
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
  out.date = article.datePublished || article.dateCreated || "";
  out.authors = [].concat(article.author || []).map((a) => (typeof a === "string" ? a : a?.name)).filter(Boolean);
  out.site = article.publisher?.name || "";
  return out;
}

// Prefer explicit publication markers. Without one, trust the first <time> only on article pages
// (og:type=article) or when it is the sole candidate, so home/list pages don't yield a random date.
function pickTime(times, isArticle) {
  const valid = times.filter((t) => normalizeDate(t.v));
  const strict = valid.find((t) => t.strict);
  if (strict) return strict.v;
  return valid.length && (isArticle || times.length === 1) ? valid[0].v : "";
}
