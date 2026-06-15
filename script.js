let players = [];

function addPlayer() {
  const name = document.getElementById("nameInput").value;
  if (!name) return;

  players.push(name);

  const li = document.createElement("li");
  li.textContent = name;
  document.getElementById("playerList").appendChild(li);

  document.getElementById("nameInput").value = "";
}

function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

function createMatches() {
  const shuffled = shuffle([...players]);
  const matchList = document.getElementById("matchList");
  matchList.innerHTML = "";

  for (let i = 0; i < shuffled.length; i += 2) {
    const p1 = shuffled[i];
    const p2 = shuffled[i + 1];

    const li = document.createElement("li");

    if (p2) {
      li.textContent = `${i / 2 + 1}試合: ${p1} vs ${p2}`;
    } else {
      li.textContent = `${i / 2 + 1}試合: ${p1}（不戦勝）`;
    }

    matchList.appendChild(li);
  }
}
