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

/**
 * 現在順位を表示する関数
 */
function renderRanking() {
  const rankingContainer = document.getElementById('ranking');
  if (!rankingContainer) return;

  const players = Object.keys(currentTournament.participants);

  // プレイヤーをソート：勝利数の多い順、同率の場合は敗北数が少ない順
  players.sort((a, b) => {
    const winDiff = (currentTournament.winCounts[b] || 0) - (currentTournament.winCounts[a] || 0);
    if (winDiff !== 0) return winDiff;

    return (currentTournament.lossCounts[a] || 0) - (currentTournament.lossCounts[b] || 0);
  });

  let html = '<h3>🏆 現在順位</h3><ol style="list-style-position: inside;">';

  players.forEach((p, index) => {
    const wins = currentTournament.winCounts[p] || 0;
    const losses = currentTournament.lossCounts[p] || 0;
    const medal = ['🥇', '🥈', '🥉'][index] || '　';

    html += `<li style="margin-bottom: 8px;">${medal} ${p}（${wins}勝${losses}敗）</li>`;
  });

  html += '</ol>';

  rankingContainer.innerHTML = html;
}

function renderMatches() {
  const roundInfo = document.getElementById('roundInfo');
  const matchesList = document.getElementById('matchesList');
  const bracketContainer = document.getElementById('bracketContainer');

  if (currentTournament.currentRound === 0) {
    roundInfo.textContent = 'ラウンド: 未開始';
    matchesList.innerHTML = '';
    bracketContainer.classList.remove('show');
    renderRanking();
    return;
  }

  roundInfo.innerHTML = `<strong>ラウンド ${currentTournament.currentRound}</strong>`;
  
  if (!currentTournament.matches || currentTournament.matches.length === 0) {
    matchesList.innerHTML = '<p style="color: #999;">試合がありません</p>';
    bracketContainer.classList.remove('show');
    renderRanking();
    return;
  }

  const currentMatches = currentTournament.matches.filter(m => m.round === currentTournament.currentRound);
  
  if (currentMatches.length === 0) {
    matchesList.innerHTML = '<p style="color: #999;">このラウンドの試合はまだ生成されていません</p>';
    bracketContainer.classList.remove('show');
    renderRanking();
    return;
  }

  // マッチカードの表示
  matchesList.innerHTML = renderMatchCards(currentMatches);

  // トーナメント形式の場合、ブラケット表示
  if (currentTournament.format === 'tournament') {
    renderTournamentBracket();
  } else {
    bracketContainer.classList.remove('show');
  }

  // 順位表を表示
  renderRanking();
}

/**
 * マッチの状態を判定（"pending" | "win" | "loss" | "approved"）
 */
function getMatchStatus(match) {
  if (!match.winner) {
    return 'pending';
  }
  if (match.approved) {
    return 'approved';
  }
  // 不戦勝の場合も approved扱い
  if (!match.player2) {
    return 'approved';
  }
  return 'win';
}

/**
 * マッチカードのHTMLを生成
 */
function renderMatchCards(matches) {
  return matches.map((match) => {
    const status = getMatchStatus(match);
    const statusMap = {
      'pending': { badge: '未決定', class: 'badge-pending' },
      'win': { badge: '勝者確定', class: 'badge-win' },
      'loss': { badge: '敗北', class: 'badge-loss' },
      'approved': { badge: '✓ 確定済み', class: 'badge-approved' }
    };
    
    const statusInfo = statusMap[status] || statusMap['pending'];
    
    return `
      <div class="match-card status-${status}">
        <div class="match-card-header">
          <span class="match-round">ラウンド ${match.round} - 第${match.number}試合</span>
          <span class="match-status-badge ${statusInfo.class}">${statusInfo.badge}</span>
        </div>
        
        <div class="match-players">
          <span class="player-name">${match.player1}</span>
          <span class="vs-text">vs</span>
          <span class="player-name">${match.player2 || '(不戦勝)'}</span>
        </div>
        
        ${match.winner ? `
          <div style="text-align: center; margin: 10px 0; padding: 8px; background: rgba(40, 167, 69, 0.1); border-radius: 4px;">
            <strong style="color: #28a745;">勝者: ${match.winner}</strong>
          </div>
        ` : ''}
        
        ${!match.player2 ? `
          <div style="text-align: center; margin: 10px 0; padding: 8px; background: rgba(23, 162, 184, 0.1); border-radius: 4px;">
            <strong style="color: #17a2b8;">不戦勝</strong>
          </div>
        ` : ''}
        
        <div class="match-actions">
          ${!match.winner && match.player2 ? `
            <button class="btn-winner" onclick="recordWinner('${match.id}', '${match.player1}')">
              ${match.player1} が勝利
            </button>
            <button class="btn-winner" onclick="recordWinner('${match.id}', '${match.player2}')">
              ${match.player2} が勝利
            </button>
          ` : ''}
          ${match.winner && !match.approved ? `
            <button class="btn-winner" style="background: #6c757d;" disabled>
              ⏳ 相手の承認待ち
            </button>
          ` : ''}
          ${match.approved ? `
            <button class="btn-winner" style="background: #17a2b8;" disabled>
              ✓ 確定済み
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * トーナメント表を生成（ブラケット表示）
 */
function renderTournamentBracket() {
  const bracketContainer = document.getElementById('bracketContainer');
  const bracket = document.getElementById('bracket');
  
  if (currentTournament.format !== 'tournament') {
    bracketContainer.classList.remove('show');
    return;
  }

  // ラウンドごとにグループ化
  const rounds = {};
  currentTournament.matches.forEach(match => {
    if (!rounds[match.round]) {
      rounds[match.round] = [];
    }
    rounds[match.round].push(match);
  });

  // ブラケットのHTML生成
  let bracketHTML = '';
  const sortedRounds = Object.keys(rounds).sort((a, b) => parseInt(a) - parseInt(b));

  sortedRounds.forEach(roundNum => {
    const roundMatches = rounds[roundNum];
    const roundLabel = roundNum === '1' ? '1回戦' : (roundNum === '2' ? '準決勝' : (roundNum === '3' ? '決勝' : `ラウンド${roundNum}`));
    
    bracketHTML += `
      <div class="bracket-round">
        <div class="bracket-round-title">${roundLabel}</div>
    `;

    roundMatches.forEach(match => {
      const isWinner = match.winner && !match.approved ? 'winner' : '';
      const isEmpty = !match.player2 && !match.winner ? 'empty' : '';
      
      bracketHTML += `
        <div class="bracket-match ${isWinner} ${isEmpty}">
          <div class="bracket-match-text">
            ${match.winner ? `<strong>${match.winner}</strong>` : 
              (match.player2 ? `${match.player1} vs ${match.player2}` : 
               `${match.player1} (不戦勝)`)}
          </div>
        </div>
      `;
    });

    bracketHTML += `</div>`;
  });

  bracket.innerHTML = bracketHTML;
  bracketContainer.classList.add('show');
}

/**
 * 勝者を記録する関数
 */
function recordWinner(matchId, winner) {
  const match = currentTournament.matches.find(m => m.id === matchId);
  if (!match) return;

  match.winner = winner;
  const loser = match.player1 === winner ? match.player2 : match.player1;

  // 敗北者の敗北数を増加
  if (loser) {
  currentTournament.lossCounts[loser]++;
  }

  (async () => {
    try {
      await manager.updateTournament(currentTournament.id, { 
        matches: currentTournament.matches,
        lossCounts: currentTournament.lossCounts
      });
      currentTournament = await manager.getTournament(currentTournament.id);
      renderMatches();
      renderRanking();
    } catch (error) {
      alert('失敗しました: ' + error.message);
    }
  })();
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

/**
 * 2つのプレイヤーが既に対戦済みかチェック
 */
function hasPaired(player1, player2) {
  if (!currentTournament.pairHistory) {
    return false;
  }
  const key = [player1, player2].sort().join('|');
  return currentTournament.pairHistory.includes(key);
}

/**
 * スイスドロー用のマッチング生成関数（勝利数ベース）
 */
function generateSwissMatches() {
  const participants = Object.keys(currentTournament.participants);
  
  let matchNumber = 1;

  // 初期化：敗北数がなければ0にセット
  participants.forEach(p => {
    if (!(p in currentTournament.lossCounts)) {
      currentTournament.lossCounts[p] = 0;
    }
  });

  // 1. プレイヤーを勝利数でグループ分け
  const groupedByWins = {};
  participants.forEach(p => {
    const wins = currentTournament.winCounts[p] || 0;
    if (!groupedByWins[wins]) {
      groupedByWins[wins] = [];
    }
    groupedByWins[wins].push(p);
  });

  // 2. 各グループをshuffleしてランダム化
  Object.keys(groupedByWins).forEach(wins => {
    groupedByWins[wins] = shuffle([...groupedByWins[wins]]);
  });

  const winCounts = Object.keys(groupedByWins)
    .map(Number)
    .sort((a, b) => b - a); // 降順（勝利数が多い順）

  const availablePlayers = new Set(participants);
  const pairs = [];

  // 3. マッチング処理
  for (const wins of winCounts) {
    const group = groupedByWins[wins].filter(p => availablePlayers.has(p));

    while (group.length >= 2) {
      const player1 = group.shift();
      availablePlayers.delete(player1);

      // 同じ勝利数グループ内から対戦相手を探す
      let player2 = null;
      for (let i = 0; i < group.length; i++) {
        if (!hasPaired(player1, group[i])) {
          player2 = group[i];
          group.splice(i, 1);
          break;
        }
      }

      // 同勝利数でペアが組めない場合は、勝利数が近いプレイヤーを探す
      if (!player2) {
        for (let i = 0; i < group.length; i++) {
          player2 = group[i];
          group.splice(i, 1);
          break;
        }
      }

      if (player2) {
        availablePlayers.delete(player2);
        pairs.push([player1, player2]);
      } else {
        // ペアが組めない場合は戻す
        group.unshift(player1);
        availablePlayers.add(player1);
      }
    }
  }

  // 4. 残った奇数人数と他グループのプレイヤーをマッチング
  const leftoverPlayers = Array.from(availablePlayers);

  
  leftoverPlayers.sort((a, b) => {
    return (currentTournament.winCounts[b] || 0)
        - (currentTournament.winCounts[a] || 0);
  });

  // 他グループとのマッチング
  for (let i = 0; i < leftoverPlayers.length - 1; i += 2) {
    pairs.push([leftoverPlayers[i], leftoverPlayers[i + 1]]);
  }

  // 5. 不戦勝の処理（奇数の場合）
  if ((participants.length - pairs.length * 2) === 1) {
    const byePlayer = Array.from(availablePlayers)[0];
    pairs.push([byePlayer, null]);
  }

  // 6. マッチオブジェクトを生成
  pairs.forEach(([player1, player2]) => {
    if (player2) {
      recordPairing(player1, player2);
      newMatches.push({
        id: `${currentTournament.currentRound}-${matchNumber}`,
        round: currentTournament.currentRound,
        number: matchNumber,
        player1,
        player2,
        winner: null,
        approved: false
      });
    } else {
      // 不戦勝
      newMatches.push({
        id: `${currentTournament.currentRound}-${matchNumber}`,
        round: currentTournament.currentRound,
        number: matchNumber,
        player1,
        player2: null,
        winner: player1,
        approved: true
      });
      currentTournament.winCounts[player1]++;
    }
    matchNumber++;
  });

  currentTournament.matches = [...currentTournament.matches, ...newMatches];

  (async () => {
    try {
      await manager.updateTournament(currentTournament.id, {
        matches: currentTournament.matches,
        winCounts: currentTournament.winCounts,
        lossCounts: currentTournament.lossCounts
      });
    } catch (error) {
      console.error('Failed to update matches:', error);
    }
  })();
}

/**
 * トーナメント形式と仗スイスドロー形式を判定してマッチング生成
 */
function generateMatches() {
  // トーナメント形式の場合は既存ロジックを使用
  if (currentTournament.format === 'tournament') {
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
    return;
  }

  // スイスドロー形式の場合は改良版マッチング
  generateSwissMatches();
}

/**
 * トーナメント形式用：勝者リストを取得
 */
function getWinners(matches) {
  return matches.map(m => m.winner).filter(w => w);
}

/**
 * トーナメント形式用：勝者からマッチを生成
 */
function generateTournamentMatches(players, round) {
  const matches = [];
  let matchNumber = 1;

  for (let i = 0; i < players.length; i += 2) {
    const player1 = players[i];
    const player2 = players[i + 1];

    if (!player2) {
      // 奇数の場合は不戦勝
      matches.push({
        id: `${round}-${matchNumber}`,
        round,
        number: matchNumber,
        player1,
        player2: null,
        winner: player1,
        approved: true
      });
      currentTournament.winCounts[player1]++;
    } else {
      matches.push({
        id: `${round}-${matchNumber}`,
        round,
        number: matchNumber,
        player1,
        player2,
        winner: null,
        approved: false
      });
    }

    matchNumber++;
  }

  return matches;
}

function nextRound() {
  const currentMatches = currentTournament.matches.filter(m => m.round === currentTournament.currentRound);
  const allApproved = currentMatches.every(m => m.approved);

  if (!allApproved) {
    alert('全ての試合が承認されていません');
    return;
  }

  // トーナメント形式の場合：勝者のみを次ラウンドに進める
  if (currentTournament.format === 'tournament') {
    const winners = getWinners(currentMatches);

    if (winners.length === 1) {
      alert(`大会終了！優勝者: ${winners[0]}`);
      currentTournament.status = 'finished';

      (async () => {
        await manager.updateTournament(currentTournament.id, {
          status: 'finished'
        });
      })();

      renderTournamentInfo();
      renderRanking();
      return;
    }

    currentTournament.currentRound += 1;
    const newMatches = generateTournamentMatches(winners, currentTournament.currentRound);
    currentTournament.matches.push(...newMatches);

    (async () => {
      try {
        await manager.updateTournament(currentTournament.id, {
          matches: currentTournament.matches,
          winCounts: currentTournament.winCounts,
          currentRound: currentTournament.currentRound
        });
      } catch (error) {
        console.error('Failed to update tournament:', error);
      }
    })();

    renderTournamentInfo();
    renderMatches();
    renderRanking();
    return;
  }

  // スイスドロー形式の場合：全参加者で再マッチング（既存ロジック）
  // 追加：全勝者チェック
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
    renderRanking();
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
  renderRanking();
}

async function finishTournament() {
  try {
    await manager.updateTournament(currentTournament.id, { status: 'finished' });
    currentTournament = await manager.getTournament(currentTournament.id);
    renderTournamentInfo();
    window.location.href = 'index.html';
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


