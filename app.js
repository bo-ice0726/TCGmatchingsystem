// API ベースURL
const API_BASE = 'http://localhost:3000/api';

// ブラウザ互換性チェック
function checkBrowserCompatibility() {
  const errors = [];
  
  if (!window.fetch) {
    errors.push('Fetch API');
  }
  
  if (!window.JSON) {
    errors.push('JSON');
  }
  
  if (errors.length > 0) {
    console.warn('未サポート機能:', errors.join(', '));
  }
}

checkBrowserCompatibility();

// API ヘルパー関数
async function apiCall(method, endpoint, data = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API エラー');
    }

    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

// 大会データ管理（API版）
class TournamentManager {
  async createTournament(name, format) {
    return await apiCall('POST', '/tournaments', { name, format });
  }

  async getTournament(code) {
    return await apiCall('GET', `/tournaments/${code}`);
  }

  async joinTournament(code, playerName) {
    return await apiCall('POST', `/tournaments/${code}/join`, { playerName });
  }

  async startTournament(code) {
    return await apiCall('POST', `/tournaments/${code}/start`);
  }

  async updateTournament(code, updates) {
    return await apiCall('PUT', `/tournaments/${code}`, updates);
  }
}

const manager = new TournamentManager();

// ホーム画面処理
async function createTournament() {
  const name = document.getElementById('tournamentName').value.trim();
  const format = document.getElementById('formatSelect').value;

  if (!name || !format) {
    showMessage('createMessage', 'エラー: 大会名と形式を入力してください', 'error');
    return;
  }

  try {
    const result = await manager.createTournament(name, format);
    const code = result.code;
    const message = `
      <p class="success">大会が作成されました！</p>
      <p>大会コード: <strong>${code}</strong></p>
      <p><button onclick="goToOrganizer('${code}')" style="width: 100%; padding: 10px; margin-top: 10px;">開催者画面へ</button></p>
    `;
    document.getElementById('createMessage').innerHTML = message;
  } catch (error) {
    showMessage('createMessage', `エラー: ${error.message}`, 'error');
  }
}

async function participateTournament() {
  const code = document.getElementById('participateCode').value.trim().toUpperCase();

  if (!code) {
    showMessage('participateMessage', 'エラー: 大会コードを入力してください', 'error');
    return;
  }

  try {
    await manager.getTournament(code);
    window.location.href = `participant.html?code=${code}`;
  } catch (error) {
    showMessage('participateMessage', 'エラー: 大会が見つかりません', 'error');
  }
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

