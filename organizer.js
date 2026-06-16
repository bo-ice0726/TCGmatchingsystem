// 開催者画面ロジック
function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

function recordPairing(player1, player2) {
  if (!player1 || !player2) return;

  // ペア履歴がなければ初期化
  if (!currentTournament.pairHistory) {
    currentTournament.pairHistory = [];
  }

  const key = [player1, player2].sort().join('|');

  if (!currentTournament.pairHistory.includes(key)) {
    currentTournament.pairHistory.push(key);
  }
}

let currentTournament = null;
let updateInterval = null;

function getCodeFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('code');
}

async function loadTournament() {
  const code = getCodeFromURL();
  if (!code) {
    window.location.href = 'index.html';
    return;
  }

  try {
    currentTournament = await manager.getTournament(code);
    renderTournamentInfo();
    renderParticipants();
    renderMatches();
    startAutoUpdate();
  } catch (error) {
    alert('大会が見つかりません');
    window.location.href = 'index.html';
  }
}

function startAutoUpdate() {
  if (updateInterval) {
    clearInterval(updateInterval);
  }

  updateInterval = setInterval(async () => {
    try {
      const code = getCodeFromURL();
      if (code) {
        currentTournament = await manager.getTournament(code);
        renderTournamentInfo();
        renderParticipants();
        renderMatches();
      }
    } catch (error) {
      console.error('Failed to update tournament:', error);
    }
  }, 2000);
}

function stopAutoUpdate() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

window.addEventListener('beforeunload', stopAutoUpdate);
window.addEventListener('pagehide', stopAutoUpdate);

function renderTournamentInfo() {
  document.getElementById('tournamentName').textContent = currentTournament.name;
  document.getElementById('codeDisplay').textContent = currentTournament.id;
  document.getElementById('formatDisplay').textContent = 
    currentTournament.format === 'tournament' ? 'トーナメント形式' : 'スイスドロー形式';
  document.getElementById('participantCountDisplay').textContent = 
    Object.keys(currentTournament.participants).length;
  
  const statusMap = { waiting: '参加受付中', started: '試合進行中', finished: '終了' };
  const statusClass = `status-${currentTournament.status}`;
  document.getElementById('statusDisplay').innerHTML = 
    `<span class="status-badge ${statusClass}">${statusMap[currentTournament.status]}</span>`;

  // ボタン表示制御
  document.getElementById('startBtn').style.display = 
    currentTournament.status === 'waiting' ? 'block' : 'none';
  document.getElementById('nextRoundBtn').style.display = 
    currentTournament.status === 'started' && currentTournament.currentRound > 0 ? 'block' : 'none';
  document.getElementById('finishBtn').style.display = 
    currentTournament.status === 'finished' ? 'block' : 'none';
}

function renderParticipants() {
  const list = document.getElementById('participantsList');
  const participants = Object.values(currentTournament.participants);
  
  if (participants.length === 0) {
    list.innerHTML = '<li style="color: #999;">参加者がいません</li>';
    return;
  }

  list.innerHTML = participants.map(p => 
    `<li class="participant-item">
      <span>${p.name}</span>
      <span>勝: ${currentTournament.winCounts[p.name] || 0} | 敗: ${currentTournament.lossCounts[p.name] || 0}</span>
    </li>`
  ).join('');
}

function renderMatches() {
  const roundInfo = document.getElementById('roundInfo');
  const matchesList = document.getElementById('matchesList');

  if (currentTournament.currentRound === 0) {
    roundInfo.textContent = 'ラウンド: 未開始';
    matchesList.innerHTML = '';
    return;
  }

  roundInfo.innerHTML = `<strong>ラウンド ${currentTournament.currentRound}</strong>`;
  
  if (!currentTournament.matches || currentTournament.matches.length === 0) {
    matchesList.innerHTML = '<p style="color: #999;">試合がありません</p>';
    return;
  }

  const currentMatches = currentTournament.matches.filter(m => m.round === currentTournament.currentRound);
  
  if (currentMatches.length === 0) {
    matchesList.innerHTML = '<p style="color: #999;">このラウンドの試合はまだ生成されていません</p>';
    return;
  }

  matchesList.innerHTML = currentMatches.map((match, idx) => `
    <div class="match-item">
      <div class="match-header">第${match.number}試合</div>
      <div class="match-result">
        ${match.player1} vs ${match.player2 || '(不戦勝)'}
        ${match.winner ? `<br/><strong>勝者: ${match.winner}</strong>` : '<br/>未決定'}
        ${match.approved ? '<br/>✓ 承認済み' : (match.winner ? '<br/>⏳ 承認待ち' : '')}
      </div>
    </div>
  `).join('');
}

function startTournament() {
  if (Object.keys(currentTournament.participants).length === 0) {
    alert('参加者がいません');
    return;
  }

  if (!confirm('大会を開始してもよろしいですか？')) {
    return;
  }

  (async () => {
    try {
      await manager.startTournament(currentTournament.id);
      currentTournament = await manager.getTournament(currentTournament.id);

      // 初期マッチング生成
      generateMatches();
      renderTournamentInfo();
      renderMatches();
    } catch (error) {
      alert('大会を開始できません: ' + error.message);
    }
  })();
}

function generateMatches() {
  const participants = Object.keys(currentTournament.participants);
  const shuffled = shuffle([...participants]);
  const newMatches = [];
  let matchNumber = 1;

  for (let i = 0; i < shuffled.length; i += 2) {
    const player1 = shuffled[i];
    const player2 = shuffled[i + 1] || null;

    newMatches.push({
      id: `${currentTournament.currentRound}-${matchNumber}`,
      round: currentTournament.currentRound,
      number: matchNumber,
      player1,
      player2,
      winner: null,
      approved: false
    });

    if (player2) {
      recordPairing(player1, player2);
    } else {
      newMatches[matchNumber - 1].winner = player1;
      newMatches[matchNumber - 1].approved = true;
      currentTournament.winCounts[player1]++;
    }

    matchNumber++;
  }

  currentTournament.matches = [...currentTournament.matches, ...newMatches];

  (async () => {
    try {
      await manager.updateTournament(currentTournament.id, {
        matches: currentTournament.matches,
        winCounts: currentTournament.winCounts
      });
    } catch (error) {
      console.error('Failed to update matches:', error);
    }
  })();
}

function nextRound() {
  const currentMatches = currentTournament.matches.filter(m => m.round === currentTournament.currentRound);
  const allApproved = currentMatches.every(m => m.approved);

  if (!allApproved) {
    alert('全ての試合が承認されていません');
    return;
  }

  // 👇追加：全勝者チェック
  const undefeated = Object.keys(currentTournament.participants).filter(p => {
    return (currentTournament.lossCounts[p] || 0) === 0;
  });

  if (undefeated.length === 1 && Object.keys(currentTournament.participants).length > 1) {
    // 終了処理
    alert(`大会終了！優勝者: ${undefeated[0]}`);

    currentTournament.status = 'finished';

    (async () => {
      await manager.updateTournament(currentTournament.id, {
        status: 'finished'
      });
    })();

    renderTournamentInfo();
    return;
  }

  // 通常の次ラウンド
  currentTournament.currentRound += 1;
  generateMatches();

  (async () => {
    await manager.updateTournament(currentTournament.id, {
      currentRound: currentTournament.currentRound
    });
  })();

  renderTournamentInfo();
  renderMatches();
}

async function finishTournament() {
  try {
    await manager.updateTournament(currentTournament.id, { status: 'finished' });
    currentTournament = await manager.getTournament(currentTournament.id);
    renderTournamentInfo();
  } catch (error) {
    alert('大会を終了できません: ' + error.message);
  }
}

// ページロード
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadTournament);
} else {
  loadTournament();
}


