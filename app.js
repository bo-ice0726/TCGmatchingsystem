// ブラウザ互換性チェック
function checkBrowserCompatibility() {
  const errors = [];
  
  // LocalStorage チェック
  if (!window.localStorage) {
    errors.push('LocalStorage');
  }
  
  // JSON チェック
  if (!window.JSON) {
    errors.push('JSON');
  }
  
  if (errors.length > 0) {
    console.warn('未サポート機能:', errors.join(', '));
  }
}

checkBrowserCompatibility();

// LocalStorage フォールバック
const storage = (() => {
  try {
    localStorage.setItem('test', 'test');
    localStorage.removeItem('test');
    return localStorage;
  } catch (e) {
    // メモリフォールバック
    let data = {};
    return {
      getItem: (key) => data[key] || null,
      setItem: (key, value) => { data[key] = value; },
      removeItem: (key) => { delete data[key]; },
      clear: () => { data = {}; }
    };
  }
})();

// 大会データ管理
class TournamentManager {
  constructor() {
    this.tournaments = this.loadFromStorage();
  }

  loadFromStorage() {
    try {
      const data = storage.getItem('tournaments');
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.error('Failed to load tournaments:', e);
      return {};
    }
  }

  saveToStorage() {
    try {
      storage.setItem('tournaments', JSON.stringify(this.tournaments));
    } catch (e) {
      console.error('Failed to save tournaments:', e);
    }
  }

  generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code += '-';
    for (let i = 0; i < 4; i++) {
      code += Math.floor(Math.random() * 10);
    }
    return code;
  }

  createTournament(name, format) {
    const code = this.generateCode();
    this.tournaments[code] = {
      id: code,
      name: name,
      format: format,
      createdAt: new Date().toISOString(),
      status: 'waiting', // waiting, started, finished
      participants: {},
      matches: [],
      currentRound: 0,
      winCounts: {},
      lossCounts: {},
      pairHistory: []
    };
    this.saveToStorage();
    return code;
  }

  getTournament(code) {
    return this.tournaments[code] || null;
  }

  joinTournament(code, playerName) {
    const tournament = this.tournaments[code];
    if (!tournament) return false;
    if (tournament.participants[playerName]) return false; // すでに参加している

    tournament.participants[playerName] = {
      name: playerName,
      joinedAt: new Date().toISOString()
    };
    tournament.winCounts[playerName] = 0;
    tournament.lossCounts[playerName] = 0;
    this.saveToStorage();
    return true;
  }

  startTournament(code) {
    const tournament = this.tournaments[code];
    if (!tournament) return false;

    tournament.status = 'started';
    tournament.currentRound = 1;
    this.saveToStorage();
    return true;
  }

  updateTournament(code, updates) {
    const tournament = this.tournaments[code];
    if (!tournament) return false;

    Object.assign(tournament, updates);
    this.saveToStorage();
    return true;
  }
}

const manager = new TournamentManager();

// ホーム画面処理
function createTournament() {
  const name = document.getElementById('tournamentName').value.trim();
  const format = document.getElementById('formatSelect').value;

  if (!name || !format) {
    showMessage('createMessage', 'エラー: 大会名と形式を入力してください', 'error');
    return;
  }

  const code = manager.createTournament(name, format);
  const message = `
    <p class="success">大会が作成されました！</p>
    <p>大会コード: <strong>${code}</strong></p>
    <p><button onclick="goToOrganizer('${code}')" style="width: 100%; padding: 10px; margin-top: 10px;">開催者画面へ</button></p>
  `;
  document.getElementById('createMessage').innerHTML = message;
}

function participateTournament() {
  const code = document.getElementById('participateCode').value.trim().toUpperCase();

  if (!code) {
    showMessage('participateMessage', 'エラー: 大会コードを入力してください', 'error');
    return;
  }

  if (!manager.getTournament(code)) {
    showMessage('participateMessage', 'エラー: 大会が見つかりません', 'error');
    return;
  }

  // 参加ページへ遷移
  window.location.href = `participant.html?code=${code}`;
}

function goToOrganizer(code) {
  window.location.href = `organizer.html?code=${code}`;
}

function showMessage(elementId, text, type) {
  const element = document.getElementById(elementId);
  if (element) {
    element.innerHTML = `<p class="${type}">${text}</p>`;
  }
}

// ページロード時の処理
function initHomePage() {
  const createMsg = document.getElementById('createMessage');
  const participateMsg = document.getElementById('participateMessage');
  if (createMsg) createMsg.innerHTML = '';
  if (participateMsg) participateMsg.innerHTML = '';
}

// DOMContentLoaded イベント対応
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHomePage);
} else {
  initHomePage();
}
