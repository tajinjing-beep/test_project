const questions = [
  { text: "あなたが望む世界の姿は？", choices: [
    { text: "完璧に管理された平和な世界", scores: [0, 0, 0, 0, 3] },
    { text: "混沌としているが自由な世界", scores: [3, 0, 0, 3, 0] }
  ]},
  { text: "知らない街で、直感的に選ぶ旅のスタイルは？", choices: [
    { text: "緻密に計画された「正解」を辿る旅", scores: [0, 0, 2, 0, 1] },
    { text: "地図を捨て、偶然の「ノイズ」を楽しむ旅", scores: [1, 0, 0, 3, 0] }
  ]},
  { text: "手に入れたい一生の称号は？", choices: [
    { text: "誰にも知られない孤高の天才", scores: [3, 0, 2, 1, 0] },
    { text: "世界中から愛される空っぽの偶像", scores: [0, 3, 0, 0, 1] }
  ]},
  { text: "ダンスフロア。あなたの理想の立ち位置は？", choices: [
    { text: "中心で全ての視線を支配する", scores: [0, 3, 2, 0, 0] },
    { text: "隅で誰にも邪魔されず没頭する", scores: [2, 0, 0, 1, 1] }
  ]},
  { text: "どちらを直視して生きたい？", choices: [
    { text: "残酷だが逃げ場のない真実", scores: [0, 0, 1, 3, 0] },
    { text: "優しくあなたを守る美しい嘘", scores: [0, 2, 0, 0, 2] }
  ]},
  { text: "あなたの行動原理を支配するのは？", choices: [
    { text: "積み上げた理性と規律", scores: [0, 0, 3, 0, 2] },
    { text: "衝動に任せた直感と反逆", scores: [3, 2, 0, 1, 0] }
  ]},
  { text: "最も「自分」を感じる瞬間は？", choices: [
    { text: "静寂の中での深い孤独", scores: [2, 0, 0, 1, 1] },
    { text: "他者と響き合う喧騒の連帯", scores: [0, 3, 0, 0, 0] }
  ]},
  { text: "あなたの人生を象徴する「道具」は？", choices: [
    { text: "機能を突き詰めた完璧な道具", scores: [0, 0, 3, 0, 2] },
    { text: "美学を貫いた不完全な象徴", scores: [3, 2, 0, 2, 0] }
  ]}
];

let userScores = [5, 5, 5, 5, 5];
let currentQuestionIndex = 0;
let myChart = null;

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['sensibilityScores', 'diagnosisHistory'], (data) => {
    if (data.sensibilityScores) userScores = data.sensibilityScores;
    renderCurrentChart();
    renderHistory(data.diagnosisHistory || []);
  });

  document.getElementById('start-analysis-btn').addEventListener('click', startQuiz);
  document.getElementById('close-btn').addEventListener('click', () => location.reload());
});

function renderCurrentChart() {
  const canvas = document.getElementById('currentChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (myChart) myChart.destroy();
  myChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['こだわり', '惹きつけ', '技術', '未知', 'シンプル'],
      datasets: [{ data: userScores, backgroundColor: 'rgba(0,0,0,0.1)', borderColor: '#000', borderWidth: 3, pointRadius: 4 }]
    },
    options: {
      scales: { r: { beginAtZero: true, max: 10, ticks: { display: false }, grid: { color: '#eee' } } },
      plugins: { legend: { display: false } },
      maintainAspectRatio: false
    }
  });
}

function renderHistory(history) {
  const list = document.getElementById('history-list');
  if (!list) return;
  list.innerHTML = history.length === 0 ? '<div style="font-size:10px; color:#999;">NO DIAGNOSIS LOG</div>' : '';
  
  history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <img src="${item.img}" class="history-img" onerror="this.src='https://via.placeholder.com/45'">
      <div class="history-info">
        <div class="history-name">${item.target}</div>
        <div class="history-soul">${item.soul}</div>
      </div>
    `;
    list.appendChild(div);
  });
}

function startQuiz() {
  document.getElementById('main-screen').style.display = 'none';
  currentQuestionIndex = 0;
  userScores = [0, 0, 0, 0, 0];
  renderQuestion();
}

function renderQuestion() {
  const q = questions[currentQuestionIndex];
  const area = document.getElementById('quiz-area');
  area.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'screen active';
  div.innerHTML = `
    <div style="font-size:10px; font-weight:900; margin-bottom:5px;">PHASE 0${currentQuestionIndex + 1} / 08</div>
    <div style="font-size:16px; font-weight:bold; margin-bottom:20px;">${q.text}</div>
  `;
  
  q.choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = "main-btn";
    btn.style.cssText = "margin-bottom:10px; background:#fff; color:#000; border:2px solid #000; text-align:left;";
    btn.innerText = choice.text;
    btn.onclick = () => {
      userScores = userScores.map((s, idx) => s + choice.scores[idx]);
      currentQuestionIndex++;
      if (currentQuestionIndex < questions.length) renderQuestion();
      else showResult();
    };
    div.appendChild(btn);
  });
  area.appendChild(div);
}

function showResult() {
  const normalizedScores = userScores.map(s => Math.min(Math.max(s, 0), 10));
  chrome.storage.local.set({ sensibilityScores: normalizedScores }, () => {
    document.getElementById('quiz-area').innerHTML = '';
    document.getElementById('result-screen').classList.add('active');
    document.getElementById('brand-name').innerText = "Analysis Complete";
    document.getElementById('brand-desc').innerText = "深層座標を特定しました。ブラウジングによる行動でグラフは成長し続けます。";
  });
}