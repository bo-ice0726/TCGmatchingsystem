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

function ensureSwissState() {
  if (!currentTournament) return;

  if (!currentTournament.byeCounts) {
    currentTournament.byeCounts = {};
  }

  Object.keys(currentTournament.participants || {}).forEach(player => {
    if (!(player in currentTournament.byeCounts)) {
      currentTournament.byeCounts[player] = 0;
    }
  });
}

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
    ensureSwissState();
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
  document.getElementById('downloadResultBtn').style.display =
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
  if (match.bothLoss) {
    return 'approved';
  }
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

        ${match.bothLoss ? `
          <div style="text-align: center; margin: 10px 0; padding: 8px; background: rgba(220, 53, 69, 0.1); border-radius: 4px;">
            <strong style="color: #dc3545;">両者敗北</strong>
          </div>
        ` : ''}

        ${match.isBye ? `
          <div style="text-align: center; margin: 10px 0; padding: 8px; background: rgba(23, 162, 184, 0.1); border-radius: 4px;">
            <strong style="color: #17a2b8;">不戦勝</strong>
          </div>
        ` : ''}
        
        <div class="match-actions">
          ${match.player2 && currentTournament.status !== 'finished' ? `
            <button class="btn-winner" onclick="recordWinner('${match.id}', '${match.player1}')" ${match.approved && match.winner === match.player1 ? 'disabled' : ''}>
              ${match.player1} が勝利${match.winner || match.bothLoss ? '（修正）' : ''}
            </button>
            <button class="btn-winner" onclick="recordWinner('${match.id}', '${match.player2}')" ${match.approved && match.winner === match.player2 ? 'disabled' : ''}>
              ${match.player2} が勝利${match.winner || match.bothLoss ? '（修正）' : ''}
            </button>
            ${currentTournament.format === 'swiss' ? `
              <button class="btn-winner" style="background: #dc3545;" onclick="recordBothLoss('${match.id}')" ${match.bothLoss ? 'disabled' : ''}>
                両者敗北${match.winner ? '（修正）' : ''}
              </button>
            ` : ''}
          ` : ''}
          ${match.winner && !match.approved ? `
            <div style="width: 100%; text-align: center; color: #6c757d; font-size: 13px;">⏳ 敗者の承認待ち（開催者が登録すると即確定します）</div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * トーナメント表を生成（ブラケット表示）
 * 1回戦の枠数から全ラウンド（決勝まで）を描画し、未生成のラウンドは空き枠で表示する。
 * 未生成ラウンドの枠には、前ラウンドの隣り合う2試合で確定した勝者を表示する。
 */
function renderTournamentBracket() {
  const bracketContainer = document.getElementById('bracketContainer');
  const bracket = document.getElementById('bracket');

  if (currentTournament.format !== 'tournament') {
    bracketContainer.classList.remove('show');
    return;
  }

  // ラウンドごとにグループ化（組番号順）
  const rounds = {};
  currentTournament.matches.forEach(match => {
    if (!rounds[match.round]) {
      rounds[match.round] = [];
    }
    rounds[match.round].push(match);
  });
  Object.values(rounds).forEach(list => list.sort((a, b) => a.number - b.number));

  const firstRound = rounds[1] || [];
  if (firstRound.length === 0) {
    bracketContainer.classList.remove('show');
    return;
  }

  // 1回戦の試合数から総ラウンド数を算出（例：4試合 → 8枠 → 3ラウンド）
  const generatedRounds = Math.max(...Object.keys(rounds).map(Number));
  const totalRounds = Math.max(Math.ceil(Math.log2(firstRound.length * 2)), generatedRounds);

  const roundLabel = round => (round === totalRounds ? '決勝' : `${round}回戦`);

  const playerRow = (name, match) => {
    if (!name) return '<div class="bracket-player tbd">未定</div>';
    let cls = '';
    if (match && match.approved && match.winner) {
      cls = match.winner === name ? 'won' : 'lost';
    }
    return `<div class="bracket-player ${cls}">${name}</div>`;
  };

  const matchBox = match => {
    if (match.isBye) {
      return `
        <div class="bracket-match bye done">
          ${playerRow(match.player1, match)}
          <div class="bracket-player bye-slot">不戦勝</div>
        </div>
      `;
    }

    let status = '対戦中';
    if (match.approved) status = '✓ 確定';
    else if (match.winner) status = '⏳ 承認待ち';

    return `
      <div class="bracket-match ${match.approved ? 'done' : ''}">
        ${playerRow(match.player1, match)}
        ${playerRow(match.player2, match)}
        <div class="bracket-match-status">${status}</div>
      </div>
    `;
  };

  // 前ラウンドの試合から確定した勝者を取得（未生成ラウンドの枠表示用）
  const advancedFrom = match => (match && match.approved ? match.winner : null);

  let bracketHTML = '';
  let prevSlots = firstRound; // 前ラウンドの枠（試合 or 予定枠）

  for (let round = 1; round <= totalRounds; round++) {
    const actual = rounds[round];
    let slots;

    if (actual) {
      slots = actual;
    } else {
      slots = [];
      for (let i = 0; i < prevSlots.length; i += 2) {
        slots.push({
          placeholder: true,
          player1: advancedFrom(prevSlots[i]),
          player2: advancedFrom(prevSlots[i + 1])
        });
      }
    }

    bracketHTML += `
      <div class="bracket-round">
        <div class="bracket-round-title">${roundLabel(round)}</div>
        <div class="bracket-round-matches">
          ${slots.map(slot => slot.placeholder ? `
            <div class="bracket-match empty">
              ${playerRow(slot.player1)}
              ${playerRow(slot.player2)}
            </div>
          ` : matchBox(slot)).join('')}
        </div>
      </div>
    `;

    prevSlots = slots;
  }

  // 優勝者
  const finalMatch = (rounds[totalRounds] || [])[0];
  const champion = advancedFrom(finalMatch);
  bracketHTML += `
    <div class="bracket-round">
      <div class="bracket-round-title">優勝</div>
      <div class="bracket-round-matches">
        <div class="bracket-match ${champion ? 'winner' : 'empty'}">
          ${champion ? `🏆 ${champion}` : '<div class="bracket-player tbd">未定</div>'}
        </div>
      </div>
    </div>
  `;

  bracket.innerHTML = bracketHTML;
  bracketContainer.classList.add('show');
}

/**
 * 勝者を記録する関数（開催者が入力する場合）
 * 開催者の登録は参加者の承認なしで即確定する。登録済みの結果の修正にも使う。
 */
function recordWinner(matchId, winner) {
  setMatchResult(matchId, winner, `${winner} の勝利`);
}

/**
 * 両者敗北を記録する関数（スイスドロー形式のみ、開催者が入力する場合）
 * 両者の敗北数を加算し、勝利数はどちらにも加算しない。
 */
function recordBothLoss(matchId) {
  if (currentTournament.format !== 'swiss') return;
  setMatchResult(matchId, null, '両者敗北');
}

/**
 * 開催者による試合結果の確定（winner が null なら両者敗北）
 */
function setMatchResult(matchId, winner, label) {
  const match = currentTournament.matches.find(m => m.id === matchId);
  if (!match || match.isBye) return;

  const bothLoss = winner === null;
  if (match.approved && match.winner === winner && !!match.bothLoss === bothLoss) return;

  if ((match.winner || match.bothLoss) && !confirm(`この試合の結果を「${label}」に修正して確定しますか？`)) {
    return;
  }

  const loserOf = w => (match.player1 === w ? match.player2 : match.player1);
  const addCount = (counts, player, delta) => {
    counts[player] = Math.max(0, (counts[player] || 0) + delta);
  };
  const applyResult = delta => {
    if (match.bothLoss) {
      addCount(currentTournament.lossCounts, match.player1, delta);
      addCount(currentTournament.lossCounts, match.player2, delta);
    } else if (match.winner) {
      addCount(currentTournament.winCounts, match.winner, delta);
      addCount(currentTournament.lossCounts, loserOf(match.winner), delta);
    }
  };

  // 確定済みの結果を修正する場合は、以前の勝敗数を取り消す
  if (match.approved) applyResult(-1);

  match.winner = winner;
  match.bothLoss = bothLoss;
  match.approved = true;
  applyResult(1);

  (async () => {
    try {
      await manager.updateTournament(currentTournament.id, {
        matches: currentTournament.matches,
        winCounts: currentTournament.winCounts,
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
 * - 1戦目：ランダムに2人ずつ組む
 * - 2戦目以降：勝利数の高い順に並べて上から2人ずつ組む（同勝利数内はランダム）
 * - 組番号は各ラウンド1から振り直す（勝利数の高い組から）
 * - 奇数人数の場合、端数の1人に最後の組番号を振り、不戦勝として勝利数+1
 */
function generateSwissMatches() {
  ensureSwissState();

  const round = currentTournament.currentRound;
  const wins = p => currentTournament.winCounts[p] || 0;
  const participants = Object.keys(currentTournament.participants);

  participants.forEach(p => {
    if (!(p in currentTournament.winCounts)) currentTournament.winCounts[p] = 0;
    if (!(p in currentTournament.lossCounts)) currentTournament.lossCounts[p] = 0;
  });

  // 1戦目はランダム、2戦目以降は勝利数の高い順（同勝利数内はシャッフル）
  let players = shuffle(participants);
  if (round > 1) {
    players.sort((a, b) => wins(b) - wins(a)); // 安定ソートなので同勝利数内はランダム順のまま
  }

  // 端数（不戦勝）の決定：並びの最後の人。
  // 2戦目以降は最下位の勝利数の中で不戦勝回数が最も少ない人を最後に回す。
  let byePlayer = null;
  if (players.length % 2 === 1) {
    if (round > 1) {
      const minWins = wins(players[players.length - 1]);
      const lowest = players.filter(p => wins(p) === minWins);
      const minBye = Math.min(...lowest.map(p => currentTournament.byeCounts[p] || 0));
      byePlayer = lowest.find(p => (currentTournament.byeCounts[p] || 0) === minBye);
    } else {
      byePlayer = players[players.length - 1];
    }
    players = players.filter(p => p !== byePlayer);
  }

  // 上から順に2人ずつ組む（可能なら再戦を避け、近い順位の未対戦相手を選ぶ）
  const pairs = [];
  const remaining = [...players];
  while (remaining.length >= 2) {
    const player1 = remaining.shift();
    let idx = remaining.findIndex(p => !hasPaired(player1, p));
    if (idx < 0) idx = 0;
    const player2 = remaining.splice(idx, 1)[0];
    pairs.push([player1, player2]);
  }

  const newMatches = [];
  let matchNumber = 1;

  pairs.forEach(([player1, player2]) => {
    recordPairing(player1, player2);
    newMatches.push({
      id: `${round}-${matchNumber}`,
      round,
      number: matchNumber,
      player1,
      player2,
      winner: null,
      approved: false
    });
    matchNumber++;
  });

  if (byePlayer) {
    // 不戦勝：生成時に勝利数+1（承認済みで生成するので approveResult では加算されない）
    currentTournament.winCounts[byePlayer] = wins(byePlayer) + 1;
    currentTournament.byeCounts[byePlayer] = (currentTournament.byeCounts[byePlayer] || 0) + 1;
    newMatches.push({
      id: `${round}-${matchNumber}`,
      round,
      number: matchNumber,
      player1: byePlayer,
      player2: null,
      winner: byePlayer,
      approved: true,
      isBye: true
    });
  }

  currentTournament.matches = [...currentTournament.matches, ...newMatches];
}

async function generateMatches() {
  // トーナメント形式の場合は既存ロジックを使用
  if (currentTournament.format === 'tournament') {
    const participants = Object.keys(currentTournament.participants);
    const shuffled = shuffle([...participants]);
    const newMatches = generateFirstTournamentRound(shuffled, currentTournament.currentRound);
    newMatches.forEach(m => recordPairing(m.player1, m.player2));

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
      pairHistory: currentTournament.pairHistory,
      currentRound: currentTournament.currentRound // 保存しないと再取得時に前ラウンドへ戻る
    });
  } catch (error) {
    console.error('Failed to update matches:', error);
  }
}

/**
 * トーナメント形式用：1回戦のマッチを生成
 * 一般的なトーナメント表と同様に、不戦勝はすべて1回戦に割り当てる。
 * 参加人数以上の最小の2の累乗を枠数とし、空き枠の数だけ不戦勝を作ることで
 * 2回戦以降の人数が必ず2の累乗（2, 4, 8, 16...）になり、以降は不戦勝が発生しない。
 * 不戦勝は承認済みで生成し、勝利数もここで加算する（存在しない相手の承認待ちにしない）
 */
function generateFirstTournamentRound(players, round) {
  let bracketSize = 2;
  while (bracketSize < players.length) bracketSize *= 2;

  const matchCount = bracketSize / 2;
  const byeCount = bracketSize - players.length;

  // 不戦勝の位置をトーナメント表全体に散らす（ビット反転順：0, 半分, 1/4, 3/4 ...）
  const bits = Math.log2(matchCount);
  const spreadOrder = [...Array(matchCount).keys()].map(i => {
    let r = 0;
    for (let b = 0; b < bits; b++) {
      if (i & (1 << b)) r |= 1 << (bits - 1 - b);
    }
    return r;
  });
  const byePositions = new Set(spreadOrder.slice(0, byeCount));

  const matches = [];
  const queue = [...players];

  for (let i = 0; i < matchCount; i++) {
    const matchNumber = i + 1;
    const player1 = queue.shift();

    if (byePositions.has(i)) {
      matches.push({
        id: `${round}-${matchNumber}`,
        round,
        number: matchNumber,
        player1,
        player2: null,
        winner: player1,
        approved: true,
        isBye: true
      });
      currentTournament.winCounts[player1] = (currentTournament.winCounts[player1] || 0) + 1;
    } else {
      matches.push({
        id: `${round}-${matchNumber}`,
        round,
        number: matchNumber,
        player1,
        player2: queue.shift(),
        winner: null,
        approved: false,
        isBye: false
      });
    }
  }

  return matches;
}

/**
 * トーナメント形式用：2回戦以降、勝者からマッチを生成
 * 組番号順に隣り合う試合の勝者同士が対戦する（1回戦で不戦勝を処理済みのため人数は常に偶数）
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
      currentTournament.winCounts[player1] = (currentTournament.winCounts[player1] || 0) + 1;
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
  if (currentTournament.format === 'swiss') {
    console.log(
      'Before nextRound',
      JSON.stringify(currentTournament.winCounts)
    );
  }

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
    // トーナメント表の位置を保つため組番号順に並べる（第1試合の勝者 vs 第2試合の勝者 ...）
    const winners = [...currentMatches]
      .sort((a, b) => a.number - b.number)
      .map(m => m.winner)
      .filter(w => w);

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

  // 終了条件：勝利数が最も高い人が1人になった時点で終了
  if (topWinners.length === 1 && maxWins > 0) {
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

  if (currentTournament.format === 'swiss') {
    console.log(
      'After nextRound',
      JSON.stringify(currentTournament.winCounts)
    );
  }
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


