// 参加者画面ロジック
let currentTournament = null;
let currentPlayer = null;
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
  } catch (error) {
    alert('大会が見つかりません');
    window.location.href = 'index.html';
    return;
  }
}

async function joinTournament() {
  const name = document.getElementById('playerName').value.trim();

  if (!name) {
    showJoinMessage('エラー: 名前を入力してください', 'error');
    return;
  }

  try {
    const result = await manager.joinTournament(currentTournament.id, name);
    currentPlayer = name;
    currentTournament = result.tournament;

    showJoinMessage('参加しました！', 'success');
    setTimeout(() => {
      showParticipateView();
    }, 500);
  } catch (error) {
    showJoinMessage('エラー: ' + error.message, 'error');
  }
}

function showJoinMessage(text, type) {
  const element = document.getElementById('joinMessage');
  if (element) {
    element.innerHTML = `<div class="message ${type}">${text}</div>`;
  }
}

function showParticipateView() {
  document.getElementById('joinSection').style.display = 'none';
  document.getElementById('participateSection').style.display = 'block';

  document.getElementById('tournamentNameDisplay').textContent = currentTournament.name;
  document.getElementById('playerNameDisplay').textContent = currentPlayer;
  
  renderStatus();
  renderMatching();
  startAutoUpdate();
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
        renderStatus();
        renderMatching();
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

window.addEventListener('pageshow', () => {
  if (currentPlayer) {
    startAutoUpdate();
  }
});


function renderStatus() {
  const statusMap = { waiting: '参加受付中', started: '試合進行中', finished: '終了' };
  document.getElementById('statusDisplay').textContent = statusMap[currentTournament.status];
  document.getElementById('roundDisplay').textContent = 
    currentTournament.currentRound > 0 ? `ラウンド ${currentTournament.currentRound}` : '未開始';

  document.getElementById('winCount').textContent = currentTournament.winCounts[currentPlayer] || 0;
  document.getElementById('lossCount').textContent = currentTournament.lossCounts[currentPlayer] || 0;
}

function renderMatching() {
  const matchingInfo = document.getElementById('matchingInfo');
  const matchActions = document.getElementById('matchActions');

  if (currentTournament.status === 'waiting') {
    matchingInfo.innerHTML = '<p style="color: #999;">大会がまだ開始されていません。開催者の開始を待ってください。</p>';
    matchActions.innerHTML = '';
    return;
  }

  if (currentTournament.currentRound === 0) {
    matchingInfo.innerHTML = '<p style="color: #999;">ラウンド情報を取得中...</p>';
    matchActions.innerHTML = '';
    return;
  }

  const currentMatches = currentTournament.matches.filter(m => m.round === currentTournament.currentRound);
  const myMatch = currentMatches.find(m => m.player1 === currentPlayer || m.player2 === currentPlayer);

  if (!myMatch) {
    matchingInfo.innerHTML = '<p style="color: #999;">このラウンドはマッチングがありません。</p>';
    matchActions.innerHTML = '';
    return;
  }

  const opponent = myMatch.player1 === currentPlayer ? myMatch.player2 : myMatch.player1;
  const isWinner = myMatch.winner === currentPlayer;
  const isLoser = myMatch.winner && myMatch.winner !== currentPlayer;

  matchingInfo.innerHTML = `
    <div class="match-info">
      <div class="match-number">第${myMatch.number}試合</div>
      <div class="opponent">対戦相手: <strong>${opponent || '(不戦勝)'}</strong></div>
      <div style="margin-top: 15px; font-size: 16px;">
        ${!myMatch.winner ? `<strong>未決定</strong>` : (isWinner ? `<strong style="color: green;">あなたが勝ちました</strong>` : `<strong style="color: red;">あなたが負けました</strong>`)}
        ${myMatch.approved ? '<br/>✓ 結果が確定しました' : (myMatch.winner ? '<br/>⏳ 相手の承認を待機中' : '')}
      </div>
    </div>
  `;

  matchActions.innerHTML = '';

  if (!myMatch.player2) {
    matchActions.innerHTML = '<p style="color: green; font-weight: bold;">不戦勝です！</p>';
  } else if (!myMatch.winner) {
    matchActions.innerHTML = `
      <button onclick="registerWin('${myMatch.id}')" class="btn-action" style="background: green;">勝利を登録</button>
      <button onclick="registerLoss('${myMatch.id}')" class="btn-action" style="background: #ff6b6b;">敗北を登録</button>
    `;
  } else if (!myMatch.approved && isLoser) {
    matchActions.innerHTML = `
      <button onclick="approveResult('${myMatch.id}')" class="btn-action">結果を承認</button>
    `;
  }
}

function registerWin(matchId) {
  const match = currentTournament.matches.find(m => m.id === matchId);
  if (!match) return;

  match.winner = currentPlayer;

  (async () => {
    try {
      await manager.updateTournament(currentTournament.id, { matches: currentTournament.matches });
      currentTournament = await manager.getTournament(currentTournament.id);
      renderMatching();
    } catch (error) {
      alert('失敗しました: ' + error.message);
    }
  })();
}

function registerLoss(matchId) {
  const match = currentTournament.matches.find(m => m.id === matchId);
  if (!match) return;

  const opponent = match.player1 === currentPlayer ? match.player2 : match.player1;
  match.winner = opponent;

  (async () => {
    try {
      await manager.updateTournament(currentTournament.id, { matches: currentTournament.matches });
      currentTournament = await manager.getTournament(currentTournament.id);
      renderMatching();
    } catch (error) {
      alert('失敗しました: ' + error.message);
    }
  })();
}

function approveResult(matchId) {
  const match = currentTournament.matches.find(m => m.id === matchId);
  if (!match) return;

  match.approved = true;

  if (!currentTournament.winCounts[match.winner]) {
    currentTournament.winCounts[match.winner] = 0;
  }
  currentTournament.winCounts[match.winner]++;

  const loser = match.player1 === match.winner ? match.player2 : match.player1;
  if (!currentTournament.lossCounts[loser]) {
    currentTournament.lossCounts[loser] = 0;
  }
  currentTournament.lossCounts[loser]++;

  (async () => {
    try {
      await manager.updateTournament(currentTournament.id, {
        matches: currentTournament.matches,
        winCounts: currentTournament.winCounts,
        lossCounts: currentTournament.lossCounts
      });
      currentTournament = await manager.getTournament(currentTournament.id);
      renderStatus();
      renderMatching();
    } catch (error) {
      alert('失敗しました: ' + error.message);
    }
  })();
}

// ページロード
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadTournament);
} else {
  loadTournament();
}


