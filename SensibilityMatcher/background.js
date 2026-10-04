const GEMINI_API_KEY = "AIzaSyBviTN8GaJXhux5Gojsb-APyeFEh4LVaEo";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "AUTO_DIAGNOSE") {
    analyzeWorldItem(request.imgUrl, sender.tab.id, true);
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "diagnose-sensibility") {
    analyzeWorldItem(info.srcUrl, tab.id, false);
  }
});

async function analyzeWorldItem(imageUrl, tabId, isAuto) {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  try {
    const responseImg = await fetch(imageUrl);
    const arrayBuffer = await responseImg.arrayBuffer();
    const base64Data = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));

    const prompt = `この画像を分析し、以下のJSON形式でのみ回答してください。
    {"target": "製品名", "soul": "精神的背景(50字以内)", "scores": [こだわり, 惹きつけ, 技術, 未知, シンプル]}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: base64Data } }] }]
      })
    });
    
    const data = await response.json();
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) return;
    
    const result = JSON.parse(data.candidates[0].content.parts[0].text.match(/\{.*\}/s)[0]);
    
    chrome.storage.local.get(['sensibilityScores', 'diagnosisHistory'], (stored) => {
      let current = stored.sensibilityScores || [5, 5, 5, 5, 5];
      let next = current.map((s, i) => Math.min(Math.max(s + (result.scores[i] - s) * 0.05, 0), 10));
      
      let history = stored.diagnosisHistory || [];
      history.unshift({ ...result, timestamp: new Date().toLocaleString(), img: imageUrl });
      
      chrome.storage.local.set({ 
        sensibilityScores: next,
        diagnosisHistory: history.slice(0, 10) 
      });

      if (!isAuto) {
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: (res) => alert(`【診断完了】\n${res.target}: ${res.soul}`),
          args: [result]
        });
      }
    });
  } catch (e) {
    console.error("Analysis Error:", e);
  }
}