// 開催者画面ロジック

/**
 * Fisher-Yates Shuffleを使用した公平なシャッフル
 * @param {Array} array - シャッフルする配列
 * @returns {Array} - シャッフルされた配列（元の配列は変更しない）
 */
function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
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
 * FIX #5: isByeフラグで不戦勝判定
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
        
        ${match.isBye ? `
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
 * 勝者を記録する関数（開催者が入力する場合）
 * FIX #3: 勝敗二重登録防止
 * FIX #4: 敗業数はここでは加算しない（approveResult時に加算）
 */
function recordWinner(matchId, winner) {
  const match = currentTournament.matches.find(m => m.id === matchId);
  if (!match) return;

  // FIX #3: 既に勝者が決定している場合は再登録不可
  if (match.winner) {
    alert('この試合は既に結果が決定しています');
    return;
  }

  match.winner = winner;
  // 敗業数の加算は approveResult() で行う

  (async () => {
    try {
      await manager.updateTournament(currentTournament.id, { 
        matches: currentTournament.matches
      });
      currentTournament = await manager.getTournament(currentTournament.id);
      renderMatches();
      renderRanking();
    } catch (error) {
      alert('失敗しました: ' + error.message);
    }
  })();
}


/**
 * 大会を開始
 * FIX #8: async化と非同期処理の完全整理
 */
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

      // 初期マッチング生成（awaitして完了を待つ）
      await generateMatches();
      
      // 保存完了後に再度取得して画面更新
      currentTournament = await manager.getTournament(currentTournament.id);
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
 * 仕様：
 * - 参加者を勝利数の多い順に並べる
 * - 同勝利数帯を優先してペアリング
 * - 各ラウンドで組番号を1から振り直す
 * - 奇数人数の場合、最後の1人は不戦勝（勝利数+1）
 */
function generateSwissMatches() {
  const participants = Object.keys(currentTournament.participants);
  
  // FIX #1: newMatches初期化（未定義問題を解消）
  const newMatches = [];
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

  // 3. マッチング処理（同勝利数帯を優先）
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

      // 同勝利数でペアが組めない場合は、グループ内から任意に選択
      if (!player2 && group.length > 0) {
        player2 = group.shift();
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
  // ルール：勝利数最小 → BYE回数最小 → ランダム で選択
  if ((participants.length - pairs.length * 2) === 1) {
    const byePlayers = Array.from(availablePlayers);
    
    // 初期化：byeCountsがなければ0にセット
    byePlayers.forEach(p => {
      if (!(p in currentTournament.byeCounts)) {
        currentTournament.byeCounts[p] = 0;
      }
    });

    // 1. 勝利数が最も少ないプレイヤーをフィルタリング
    const minWins = Math.min(...byePlayers.map(p => currentTournament.winCounts[p] || 0));
    let candidates = byePlayers.filter(p => (currentTournament.winCounts[p] || 0) === minWins);

    // 2. 候補が複数いる場合、過去BYE回数が最も少ないプレイヤーをフィルタリング
    if (candidates.length > 1) {
      const minByeCount = Math.min(...candidates.map(p => currentTournament.byeCounts[p] || 0));
      candidates = candidates.filter(p => (currentTournament.byeCounts[p] || 0) === minByeCount);
    }

    // 3. それでも複数いる場合のみランダムに選ぶ
    let byePlayer;
    if (candidates.length === 1) {
      byePlayer = candidates[0];
    } else {
      byePlayer = candidates[Math.floor(Math.random() * candidates.length)];
    }

    pairs.push([byePlayer, null]);
    
    // BYE回数を増加
    currentTournament.byeCounts[byePlayer]++;
  }

  // 6. マッチオブジェクトを生成
  pairs.forEach(([player1, player2]) => {
    if (player2) {
      // 通常マッチ
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
      // FIX #5: 不戦勝時の勝利数加算は、生成時のみ（approveResult時には加算しない）
      // 不戦勝フラグで判定できるようにする
      newMatches.push({
        id: `${currentTournament.currentRound}-${matchNumber}`,
        round: currentTournament.currentRound,
        number: matchNumber,
        player1,
        player2: null,
        winner: player1,
        approved: true,
        isBye: true // 不戦勝フラグを追加
      });
      // 不戦勝時の勝利数加算（ここでのみ実行）
      currentTournament.winCounts[player1]++;
    }
    matchNumber++;
  });

  currentTournament.matches = [...currentTournament.matches, ...newMatches];
}

/**
 * トーナメント形式と スイスドロー形式を判定してマッチング生成
 * async化：保存完了後に画面更新
 */
async function generateMatches() {
  // トーナメント形式の場合は既存ロジックを使用
  if (currentTournament.format === 'tournament') {
    const participants = Object.keys(currentTournament.participants);
    const shuffled = shuffle([...participants]);
    const newMatches = [];
    let matchNumber = 1;

    for (let i = 0; i < shuffled.length; i += 2) {
      const player1 = shuffled[i];
      const player2 = shuffled[i + 1] || null;

      if (!player2) {
        // FIX #5: 不戦勝時の勝利数加算（生成時のみ）
        newMatches.push({
          id: `${currentTournament.currentRound}-${matchNumber}`,
          round: currentTournament.currentRound,
          number: matchNumber,
          player1,
          player2: null,
          winner: player1,
          approved: true,
          isBye: true // 不戦勝フラグ
        });
        currentTournament.winCounts[player1]++;
      } else {
        // 通常マッチ
        newMatches.push({
          id: `${currentTournament.currentRound}-${matchNumber}`,
          round: currentTournament.currentRound,
          number: matchNumber,
          player1,
          player2,
          winner: null,
          approved: false
        });
        recordPairing(player1, player2);
      }

      matchNumber++;
    }

    currentTournament.matches = [...currentTournament.matches, ...newMatches];

    // FIX #7: 保存を await（保存完了後に画面更新）
    try {
      await manager.updateTournament(currentTournament.id, {
        matches: currentTournament.matches,
        winCounts: currentTournament.winCounts
      });
    } catch (error) {
      console.error('Failed to update matches:', error);
    }
    return;
  }

  // スイスドロー形式の場合は改良版マッチング
  generateSwissMatches();
  
  // FIX #7: 保存を await（保存完了後に画面更新）
  try {
    await manager.updateTournament(currentTournament.id, {
      matches: currentTournament.matches,
      winCounts: currentTournament.winCounts,
      lossCounts: currentTournament.lossCounts,
      byeCounts: currentTournament.byeCounts, // BYE回数を保存
      pairHistory: currentTournament.pairHistory
    });
  } catch (error) {
    console.error('Failed to update matches:', error);
  }
}

/**
 * トーナメント形式用：勝者からマッチを生成
 * FIX #9: 組番号を1から再採番（新ラウンドでリセット）
 * FIX #5: 不戦勝フラグを使用
 */
function generateTournamentMatches(players, round) {
  const matches = [];
  let matchNumber = 1; // 新ラウンドで組番号をリセット

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
        approved: true,
        isBye: true // 不戦勝フラグ
      });
      // 不戦勝時の勝利数加算（ここでのみ）
      currentTournament.winCounts[player1]++;
    } else {
      matches.push({
        id: `${round}-${matchNumber}`,
        round,
        number: matchNumber,
        player1,
        player2,
        winner: null,
        approved: false,
        isBye: false
      });
    }

    matchNumber++;
  }

  return matches;
}

/**
 * 次ラウンドへ進む
 * FIX #8: async化と非同期処理の完全整理
 * FIX #9: トーナメント形式で勝者のみ抽出
 * FIX #10: スイスドロー終了条件を勝利数最大でチェック
 */
async function nextRound() {
  const currentMatches = currentTournament.matches.filter(m => m.round === currentTournament.currentRound);
  const allApproved = currentMatches.every(m => m.approved);

  if (!allApproved) {
    alert('全ての試合が承認されていません');
    return;
  }

  // ============================================
  // トーナメント形式：勝者のみを次ラウンドに進める
  // ============================================
  if (currentTournament.format === 'tournament') {
    // FIX #9: 勝者のみを抽出
    const winners = currentMatches.map(m => m.winner).filter(w => w);

    if (winners.length === 1) {
      // 終了条件：勝者が1人
      alert(`大会終了！優勝者: ${winners[0]}`);
      currentTournament.status = 'finished';

      try {
        await manager.updateTournament(currentTournament.id, {
          status: 'finished'
        });
        currentTournament = await manager.getTournament(currentTournament.id);
      } catch (error) {
        console.error('Failed to finish tournament:', error);
      }

      renderTournamentInfo();
      renderRanking();
      return;
    }

    // 次ラウンドを生成
    currentTournament.currentRound += 1;
    const newMatches = generateTournamentMatches(winners, currentTournament.currentRound);
    currentTournament.matches.push(...newMatches);

    try {
      await manager.updateTournament(currentTournament.id, {
        matches: currentTournament.matches,
        winCounts: currentTournament.winCounts,
        currentRound: currentTournament.currentRound
      });
      currentTournament = await manager.getTournament(currentTournament.id);
    } catch (error) {
      console.error('Failed to update tournament:', error);
    }

    renderTournamentInfo();
    renderMatches();
    renderRanking();
    return;
  }

  // ============================================
  // スイスドロー形式：全参加者で再マッチング
  // ============================================

  // FIX #10: スイスドロー終了条件を勝利数最大でチェック
  // 勝利数最大のプレイヤーを取得
  let maxWins = 0;
  for (const player of Object.keys(currentTournament.participants)) {
    const wins = currentTournament.winCounts[player] || 0;
    if (wins > maxWins) {
      maxWins = wins;
    }
  }

  // 勝利数最大のプレイヤー数をカウント
  const topWinners = Object.keys(currentTournament.participants).filter(p => 
    (currentTournament.winCounts[p] || 0) === maxWins
  );

  if (topWinners.length === 1 && Object.keys(currentTournament.participants).length > 1) {
    // 終了条件：勝利数最大のプレイヤーが1人
    alert(`大会終了！優勝者: ${topWinners[0]}`);
    currentTournament.status = 'finished';

    try {
      await manager.updateTournament(currentTournament.id, {
        status: 'finished'
      });
      currentTournament = await manager.getTournament(currentTournament.id);
    } catch (error) {
      console.error('Failed to finish tournament:', error);
    }

    renderTournamentInfo();
    renderRanking();
    return;
  }

  // 通常の次ラウンド
  currentTournament.currentRound += 1;
  await generateMatches();

  try {
    currentTournament = await manager.getTournament(currentTournament.id);
  } catch (error) {
    console.error('Failed to get updated tournament:', error);
  }

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


