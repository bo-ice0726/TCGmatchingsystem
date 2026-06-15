let players = [];
let matches = [];
let currentRound = 1;
let winCounts = {};
let pairHistory = new Set();

function getPairKey(playerA, playerB) {
  if (!playerA || !playerB) return "";
  return [playerA, playerB].sort().join("|");
}

function hasPlayedBefore(playerA, playerB) {
  return pairHistory.has(getPairKey(playerA, playerB));
}

function recordPairing(playerA, playerB) {
  if (!playerA || !playerB) return;
  pairHistory.add(getPairKey(playerA, playerB));
}

function addPlayer() {
  const name = document.getElementById("nameInput").value.trim();
  if (!name) return;

  if (!winCounts[name]) {
    winCounts[name] = 0;
  }

  players.push(name);
  renderPlayerList();
  renderRanking();
  document.getElementById("nameInput").value = "";
}

function getSelectedMode() {
  return document.getElementById("modeSelect").value;
}

function getModeLabel() {
  return getSelectedMode() === "swiss" ? "スイスドロー" : "トーナメント";
}

function renderPlayerList() {
  const list = document.getElementById("playerList");
  list.innerHTML = "";

  players.forEach((name) => {
    const li = document.createElement("li");
    li.textContent = name;
    list.appendChild(li);
  });
}

function renderRanking() {
  const ranking = document.getElementById("rankingList");
  ranking.innerHTML = "";

  const sorted = Object.entries(winCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  sorted.forEach(([name, wins]) => {
    const li = document.createElement("li");
    li.textContent = `${name}: ${wins}勝`;
    ranking.appendChild(li);
  });
}

function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

function createMatches() {
  if (players.length === 0) return;

  if (matches.length === 0) {
    currentRound = 1;
    pairHistory.clear();
  }

  if (getSelectedMode() === "swiss") {
    matches = createSwissMatches(players);
  } else {
    matches = createTournamentMatches(players);
  }

  renderRoundInfo();
  renderMatches();
}

function createTournamentMatches(playerList) {
  const shuffled = shuffle([...playerList]);
  const roundMatches = [];

  for (let i = 0; i < shuffled.length; i += 2) {
    const player1 = shuffled[i];
    const player2 = shuffled[i + 1] || null;

    roundMatches.push({
      player1,
      player2,
      winner: null,
      approved: false,
      status: player2 ? "waiting" : "bye"
    });
  }

  return roundMatches;
}

function createSwissMatches(playerList) {
  const sorted = [...playerList].sort((a, b) => {
    const diff = (winCounts[b] || 0) - (winCounts[a] || 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  const roundMatches = [];
  const used = new Set();

  for (let i = 0; i < sorted.length; i += 2) {
    if (used.has(sorted[i])) continue;

    let player1 = sorted[i];
    let player2 = null;

    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(sorted[j])) continue;
      if (!hasPlayedBefore(player1, sorted[j])) {
        player2 = sorted[j];
        break;
      }
    }

    if (!player2) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (used.has(sorted[j])) continue;
        player2 = sorted[j];
        break;
      }
    }

    if (player2) {
      used.add(player1);
      used.add(player2);
      roundMatches.push({
        player1,
        player2,
        winner: null,
        approved: false,
        status: "waiting"
      });
      recordPairing(player1, player2);
    } else {
      roundMatches.push({
        player1,
        player2: null,
        winner: null,
        approved: false,
        status: "bye"
      });
    }
  }

  return roundMatches;
}

function renderMatches() {
  const matchList = document.getElementById("matchList");
  matchList.innerHTML = "";

  matches.forEach((match, index) => {
    const container = document.createElement("div");
    container.className = "match-item";

    const header = document.createElement("div");
    header.textContent = `${index + 1}試合: ${match.player1} vs ${match.player2 || "(不戦勝)"}`;
    container.appendChild(header);

    const actions = document.createElement("div");
    actions.className = "status";

    if (!match.player2) {
      match.winner = match.player1;
      match.approved = true;
      match.status = "bye";
      if (!match.counted) {
        incrementWinCount(match.player1);
        match.counted = true;
      }
      actions.textContent = `不戦勝: ${match.player1} は自動的に勝者です。`;
    } else if (!match.winner) {
      const button1 = document.createElement("button");
      button1.textContent = `${match.player1} を勝者として登録`; 
      button1.onclick = () => registerWinner(index, match.player1);

      const button2 = document.createElement("button");
      button2.textContent = `${match.player2} を勝者として登録`;
      button2.onclick = () => registerWinner(index, match.player2);

      actions.appendChild(button1);
      actions.appendChild(button2);
    } else if (!match.approved) {
      const loser = match.winner === match.player1 ? match.player2 : match.player1;
      actions.textContent = `${match.winner} が勝者として登録されました。${loser} は結果を承認してください。`;

      const approveButton = document.createElement("button");
      approveButton.textContent = `${loser} の承認`; 
      approveButton.onclick = () => approveResult(index);
      actions.appendChild(approveButton);
    } else {
      actions.textContent = `${match.winner} の勝利が承認されました。`; 
    }

    container.appendChild(actions);
    matchList.appendChild(container);
  });

  const allComplete = matches.length > 0 && matches.every((match) => match.approved);
  const control = document.createElement("div");
  control.style.marginTop = "16px";

  if (allComplete && matches.length > 1) {
    const nextButton = document.createElement("button");
    nextButton.textContent = "次のラウンドへ進む";
    nextButton.onclick = nextRound;
    control.appendChild(nextButton);
  }

  if (matches.length === 1 && allComplete) {
    const finalText = document.createElement("div");
    finalText.textContent = `大会終了: ${matches[0].winner} が優勝です。`;
    finalText.style.marginTop = "10px";
    control.appendChild(finalText);
  }

  matchList.appendChild(control);
}

function registerWinner(matchIndex, winnerName) {
  const match = matches[matchIndex];
  if (!match || match.winner) return;

  match.winner = winnerName;
  match.status = "pendingApproval";
  match.approved = false;
  renderMatches();
}

function approveResult(matchIndex) {
  const match = matches[matchIndex];
  if (!match || !match.winner || match.approved) return;

  match.approved = true;
  match.status = "approved";
  if (!match.counted) {
    incrementWinCount(match.winner);
    match.counted = true;
  }
  renderMatches();
}

function incrementWinCount(name) {
  if (!winCounts[name]) {
    winCounts[name] = 0;
  }
  winCounts[name] += 1;
  renderRanking();
}

function nextRound() {
  const allComplete = matches.length > 0 && matches.every((match) => match.approved);
  if (!allComplete) return;

  if (getSelectedMode() === "swiss") {
    currentRound += 1;
    createMatches();
    return;
  }

  const winners = matches
    .filter((match) => match.winner)
    .map((match) => match.winner);

  players = winners;

  if (players.length > 1) {
    currentRound += 1;
    renderPlayerList();
    createMatches();
  } else {
    renderPlayerList();
    renderRoundInfo();
    renderMatches();
  }
}

function renderRoundInfo() {
  const roundInfo = document.getElementById("roundInfo");
  roundInfo.textContent = `方式: ${getModeLabel()} | ラウンド ${currentRound}`;
}

