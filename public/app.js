// API ベースURL（Render のバックエンド URL をここで変更できます）
const API_URL = 'https://tcgmatchingsystem.onrender.com/api';

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
    const response = await fetch(`${API_URL}${endpoint}`, options);
    
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

// 大会コードの正規化（全角/半角・大文字/小文字の違いを吸収。server.js と同じ処理）
function normalizeCode(code) {
  return String(code || '').normalize('NFKC').trim().toUpperCase();
}

// 大会コードとして使えるか（2〜30文字、空白・制御文字と / \ ? # % < > " ' ` は不可）
function isValidCode(code) {
  const length = Array.from(code).length;
  return length >= 2 && length <= 30 && !/[\s\/\\?#%<>"'`\u0000-\u001f\u007f]/.test(code);
}

// 大会データ管理（API版）
class TournamentManager {
  async createTournament(name, format, code) {
    return await apiCall('POST', '/tournaments', { name, format, code });
  }

  async getTournament(code) {
    return await apiCall('GET', `/tournaments/${encodeURIComponent(code)}`);
  }

  async joinTournament(code, playerName) {
    return await apiCall('POST', `/tournaments/${encodeURIComponent(code)}/join`, { playerName });
  }

  async startTournament(code) {
    return await apiCall('POST', `/tournaments/${encodeURIComponent(code)}/start`);
  }

  async updateTournament(code, updates) {
    return await apiCall('PUT', `/tournaments/${encodeURIComponent(code)}`, updates);
  }
}

const manager = new TournamentManager();

// 順位順のプレイヤー一覧（勝利数の多い順、同率なら敗北数の少ない順。開催者画面の順位表と同じ並び）
function getStandings(tournament) {
  const players = Object.keys(tournament.participants);
  players.sort((a, b) => {
    const winDiff = (tournament.winCounts[b] || 0) - (tournament.winCounts[a] || 0);
    if (winDiff !== 0) return winDiff;
    return (tournament.lossCounts[a] || 0) - (tournament.lossCounts[b] || 0);
  });
  return players.map(name => ({
    name,
    wins: tournament.winCounts[name] || 0,
    losses: tournament.lossCounts[name] || 0
  }));
}

// 最終戦績を PNG 画像として描画してダウンロードする（highlightPlayer の行は強調表示）
function downloadResultImage(tournament, highlightPlayer = null) {
  const standings = getStandings(tournament);
  const font = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
  const width = 800;
  const headerHeight = 200;
  const rowHeight = 52;
  const footerHeight = 60;
  const height = headerHeight + rowHeight * (standings.length + 1) + footerHeight;
  const scale = 2; // 高解像度で書き出す

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.textBaseline = 'middle';

  // 長い文字列は末尾を「…」で省略する
  const fitText = (text, maxWidth) => {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let chars = Array.from(text);
    while (chars.length > 0 && ctx.measureText(chars.join('') + '…').width > maxWidth) {
      chars.pop();
    }
    return chars.join('') + '…';
  };

  // 背景とヘッダー
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#0066cc';
  ctx.fillRect(0, 0, width, headerHeight - 30);

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 20px ${font}`;
  ctx.fillText('🏆 最終戦績', 40, 40);
  ctx.font = `bold 34px ${font}`;
  ctx.fillText(fitText(tournament.name, width - 80), 40, 88);

  const formatLabel = tournament.format === 'tournament' ? 'トーナメント形式' : 'スイスドロー形式';
  const date = new Date(tournament.createdAt).toLocaleDateString('ja-JP');
  ctx.font = `16px ${font}`;
  ctx.fillText(
    fitText(`${formatLabel} ・ 参加者 ${standings.length}人 ・ ${tournament.currentRound}ラウンド ・ ${date} ・ 大会コード: ${tournament.id}`, width - 80),
    40, 135
  );

  // 表の列位置
  const tableTop = headerHeight;
  const colRank = 40;
  const colName = 130;
  const colWins = 600;
  const colLosses = 700;

  // 表の見出し
  ctx.fillStyle = '#666666';
  ctx.font = `bold 15px ${font}`;
  const headY = tableTop + rowHeight / 2;
  ctx.fillText('順位', colRank, headY);
  ctx.fillText('プレイヤー', colName, headY);
  ctx.textAlign = 'center';
  ctx.fillText('勝', colWins, headY);
  ctx.fillText('敗', colLosses, headY);
  ctx.textAlign = 'left';

  const medals = ['🥇', '🥈', '🥉'];
  const topColors = ['#fff8dc', '#f2f4f7', '#fbeee4'];

  standings.forEach((p, index) => {
    const top = tableTop + rowHeight * (index + 1);
    const y = top + rowHeight / 2;

    // 行の背景（上位3人は色付き、自分の行は青系）
    if (p.name === highlightPlayer) {
      ctx.fillStyle = '#e3f0ff';
    } else {
      ctx.fillStyle = topColors[index] || (index % 2 === 0 ? '#ffffff' : '#f9f9f9');
    }
    ctx.fillRect(20, top + 3, width - 40, rowHeight - 6);

    ctx.fillStyle = '#333333';
    ctx.font = `bold 20px ${font}`;
    ctx.fillText(medals[index] || `${index + 1}`, colRank + 4, y);

    ctx.font = `${index < 3 ? 'bold ' : ''}20px ${font}`;
    ctx.fillText(fitText(p.name, colWins - colName - 60), colName, y);

    ctx.textAlign = 'center';
    ctx.fillText(String(p.wins), colWins, y);
    ctx.fillText(String(p.losses), colLosses, y);
    ctx.textAlign = 'left';
  });

  // フッター
  ctx.fillStyle = '#999999';
  ctx.font = `13px ${font}`;
  ctx.textAlign = 'right';
  ctx.fillText('TCGマッチングシステム', width - 40, height - footerHeight / 2);
  ctx.textAlign = 'left';

  // ファイル名に使えない文字は置き換える
  const fileName = `${tournament.name}_戦績.png`.replace(/[\\/:*?"<>|]/g, '_');

  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

// ホーム画面処理
async function createTournament() {
  const name = document.getElementById('tournamentName').value.trim();
  const format = document.getElementById('formatSelect').value;
  const customCode = normalizeCode(document.getElementById('customCode').value);

  if (!name || !format) {
    showMessage('createMessage', 'エラー: 大会名と形式を入力してください', 'error');
    return;
  }

  if (customCode && !isValidCode(customCode)) {
    showMessage('createMessage', 'エラー: 大会コードは2〜30文字で、空白と記号 / \\ ? # % &lt; &gt; " \' ` は使えません', 'error');
    return;
  }

  try {
    const result = await manager.createTournament(name, format, customCode);
    const code = result.code;
    const message = document.getElementById('createMessage');
    message.innerHTML = `
      <p class="success">大会が作成されました！</p>
      <p>大会コード: <strong></strong></p>
      <p><button style="width: 100%; padding: 10px; margin-top: 10px;">開催者画面へ</button></p>
    `;
    // コードは任意の文字列なので HTML に埋め込まず、textContent とイベントで扱う
    message.querySelector('strong').textContent = code;
    message.querySelector('button').addEventListener('click', () => goToOrganizer(code));
  } catch (error) {
    showMessage('createMessage', `エラー: ${error.message}`, 'error');
  }
}

async function participateTournament() {
  const code = normalizeCode(document.getElementById('participateCode').value);

  if (!code) {
    showMessage('participateMessage', 'エラー: 大会コードを入力してください', 'error');
    return;
  }

  try {
    await manager.getTournament(code);
    window.location.href = `participant.html?code=${encodeURIComponent(code)}`;
  } catch (error) {
    showMessage('participateMessage', 'エラー: 大会が見つかりません', 'error');
  }
}

function goToOrganizer(code) {
  window.location.href = `organizer.html?code=${encodeURIComponent(code)}`;
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

