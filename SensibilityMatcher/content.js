// --- 1. ブランドデータベース ---
const brands = [
  { name: "Maison Special", scores: [8, 9, 4, 5, 8], img: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800", url: "https://maisonspecial.co.jp/" },
  { name: "Aesop", scores: [5, 8, 3, 5, 10], img: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=800", url: "https://www.aesop.com/jp/" },
  { name: "Dr.Martens", scores: [9, 7, 8, 8, 4], img: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800", url: "https://www.google.com/search?q=Dr.Martens" }
];

// --- 2. 広告浄化ロジック（ブランドパネル対応） ---
function purifyAds() {
  const adSelectors = [
    'ins.adsbygoogle', 'iframe[src*="googleads"]', 'iframe[src*="doubleclick"]', 'iframe[src*="amazon-adsystem"]',
    // Yahoo特化（ブランドパネル、ダミー親要素を直接指定）
    '#brand-panel', '[id*="brandPanel"]', '[id^="yads_dummy"]', '[id*="yads"]', '[class*="yads"]', '[class*="y_ad"]',
    '.ad_area', '.ad_box', '.ad_module', '[class*="AdWrapper"]', '[class*="AdSlot"]', '[id*="div-gpt-ad"]', 
    '[class*="sponsored"]', '.ad-unit', '.ad-container', 'div[id^="ad"]', 'div[class^="ad"]'
  ];

  document.querySelectorAll(adSelectors.join(',')).forEach(slot => {
    const isOverlay = slot.offsetWidth > window.innerWidth * 0.8 && slot.offsetHeight > window.innerHeight * 0.8;
    
    // 【重要】Yahooの広告枠は特殊なCSSで高さ0になっていることがあるため、yads系は高さチェックを免除する
    const isYahooAd = slot.id.includes('yads') || slot.id.includes('brand');
    
    if (slot.dataset.purified || (!isYahooAd && slot.offsetHeight < 20) || isOverlay) return;
    
    slot.dataset.purified = "true";
    const gift = brands[Math.floor(Math.random() * brands.length)];
    
    slot.style.setProperty('display', 'none', 'important');
    
    const container = document.createElement('div');
    // ブランドパネルのような巨大広告にも対応できるよう高さを動的に調整
    const h = Math.max(slot.offsetHeight || 250, 180); 
    container.style.cssText = `
      border:3px solid #000 !important; background:#fff !important; 
      padding:12px !important; margin:15px 0 !important; cursor:pointer !important;
      font-family: 'Helvetica Neue', sans-serif !important; box-sizing: border-box !important;
      display: block !important; width: 100% !important;
    `;
    container.innerHTML = `
      <div style="font-size:10px; font-weight:900; border-bottom:2px solid #000; margin-bottom:8px; display:flex; justify-content:space-between; color:#000;">
        <span>SENSIBILITY GIFT</span>
        <span style="text-transform:uppercase;">${gift.name}</span>
      </div>
      <img src="${gift.img}" style="width:100%; height:${h - 50}px; object-fit:cover; border:1px solid #000;">
      <div style="font-size:11px; font-weight:bold; margin-top:8px; text-align:center; color:#000;">CLICK TO EXPLORE</div>
    `;
    
    container.onclick = (e) => {
      e.preventDefault();
      window.open(gift.url, '_blank');
    };
    
    if (slot.parentNode) {
      slot.parentNode.insertBefore(container, slot);
    }
  });
}

const observer = new MutationObserver((mutations) => {
  let shouldPurify = false;
  for (let mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      shouldPurify = true;
      break;
    }
  }
  if (shouldPurify) purifyAds();
});

observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener('load', purifyAds);
purifyAds();
// 動的に遅れて表示されるブランドパネル対策として頻度を維持
setInterval(purifyAds, 3000); 

// --- 3. 自動データ収集（5秒に1回のペースを維持） ---
const analyzedImages = new Set();
let requestQueue = [];
let isProcessing = false;

function scanImages() {
  document.querySelectorAll('img').forEach(img => {
    const src = img.src;
    if (src && src.startsWith('http') && !analyzedImages.has(src) && img.width > 250) {
      analyzedImages.add(src);
      requestQueue.push(src);
    }
  });
  if (!isProcessing) processQueue();
}

async function processQueue() {
  if (requestQueue.length === 0) { isProcessing = false; return; }
  isProcessing = true;
  chrome.runtime.sendMessage({ type: "AUTO_DIAGNOSE", imgUrl: requestQueue.shift() });
  setTimeout(processQueue, 5000); 
}

setInterval(scanImages, 15000);