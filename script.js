let players = [];
let matches = [];
let currentRound = 1;
let winCounts = {};

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
  }

  const shuffled = shuffle([...players]);
  matches = [];

  for (let i = 0; i < shuffled.length; i += 2) {
    const player1 = shuffled[i];
    const player2 = shuffled[i + 1] || null;

    matches.push({
      player1,
      player2,
      winner: null,
      approved: false,
      status: player2 ? "waiting" : "bye"
    });
  }

  renderRoundInfo();
  renderMatches();
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
  const winners = matches
    .filter((match) => match.winner)
    .map((match) => match.winner);

  if (winners.length <= 1) {
    players = winners;
    renderPlayerList();
    renderMatches();
    return;
  }

  players = winners;
  currentRound += 1;
  renderPlayerList();
  createMatches();
}

function renderRoundInfo() {
  const roundInfo = document.getElementById("roundInfo");
  roundInfo.textContent = `ラウンド ${currentRound}`;
}

