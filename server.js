const BACKUP_FILE = path.join(__dirname, 'backup.json');

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'tournaments.json');

// ミドルウェア
app.use(cors());
app.use(express.json());
// フロントファイルは public フォルダに配置して配信する
app.use(express.static('public'));

// データ管理
class TournamentManager {
  constructor() {
    this.tournaments = {};
  }

  async load() {
    try {
      const data = await fs.readFile(DATA_FILE, 'utf-8');
      this.tournaments = JSON.parse(data);
    } catch (e) {
      this.tournaments = {};
    }
  }

  async save() {
    try {
      await this.cleanupOldTournaments();
      await fs.writeFile(
        DATA_FILE,
        JSON.stringify(this.tournaments, null, 2), 
        'utf-8'
      );
    } catch (e) {
      console.error('Failed to save tournaments:', e);
    }
  }

  generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code += '-';
    for (let i = 0; i < 4; i++) {
      code += Math.floor(Math.random() * 10);
    }
    return code;
  }

  createTournament(name, format) {
    let code;
    do {
      code = this.generateCode();
    } while (this.tournaments[code]);

    this.tournaments[code] = {
      id: code,
      name: name,
      format: format,
      createdAt: new Date().toISOString(),
      status: 'waiting',
      participants: {},
      matches: [],
      currentRound: 0,
      winCounts: {},
      lossCounts: {},
      pairHistory: []
    };

    return code;
  }

  getTournament(code) {
    return this.tournaments[code] || null;
  }

  joinTournament(code, playerName) {
    const tournament = this.tournaments[code];
    if (!tournament) return false;
    if (tournament.participants[playerName]) return false;

    tournament.participants[playerName] = {
      name: playerName,
      joinedAt: new Date().toISOString()
    };
    tournament.winCounts[playerName] = 0;
    tournament.lossCounts[playerName] = 0;

    return true;
  }

  startTournament(code) {
    const tournament = this.tournaments[code];
    if (!tournament) return false;

    tournament.status = 'started';
    tournament.currentRound = 1;

    return true;
  }

  updateTournament(code, updates) {
    const tournament = this.tournaments[code];
    if (!tournament) return false;

    Object.assign(tournament, updates);

    return true;
  }

  async backupTournament(code) {
    if (!this.tournaments[code]) return;

    let backupData = [];

    try {
      const data = await fs.readFile(BACKUP_FILE, 'utf-8');
      backupData = JSON.parse(data);
    } catch (e) {
      backupData = [];
    }

    backupData.push(this.tournaments[code]);

    await fs.writeFile(BACKUP_FILE, JSON.stringify(backupData, null, 2), 'utf-8');
  }

  async cleanupOldTournaments() {
    const now = new Date();

    for (const code of Object.keys(this.tournaments)) {
      const tournament = this.tournaments[code];
      const created = new Date(tournament.createdAt);
      const diffHours = (now - created) / (1000 * 60 * 60);

      // 24時間以上経過した大会データを自動削除
      if (diffHours > 24) {
        await this.backupTournament(code);
        delete this.tournaments[code];
      }
    }
  }

}

const manager = new TournamentManager();

// ルート
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: 大会作成
app.post('/api/tournaments', async (req, res) => {
  const { name, format } = req.body;

  if (!name || !format) {
    return res.status(400).json({ error: '名前と形式が必要です' });
  }

  const code = manager.createTournament(name, format);
  await manager.save();

  res.json({ code, tournament: manager.getTournament(code) });
});

// API: 大会取得
app.get('/api/tournaments/:code', (req, res) => {
  const { code } = req.params;
  const tournament = manager.getTournament(code);

  if (!tournament) {
    return res.status(404).json({ error: '大会が見つかりません' });
  }

  res.json(tournament);
});

// API: 大会に参加
app.post('/api/tournaments/:code/join', async (req, res) => {
  const { code } = req.params;
  const { playerName } = req.body;

  if (!playerName) {
    return res.status(400).json({ error: 'プレイヤー名が必要です' });
  }

  const tournament = manager.getTournament(code);
  if (!tournament) {
    return res.status(404).json({ error: '大会が見つかりません' });
  }

  if (!manager.joinTournament(code, playerName)) {
    return res.status(400).json({ error: 'この名前は既に登録されています' });
  }

  await manager.cleanupOldTournaments();
  await manager.save();

  res.json({ success: true, tournament: manager.getTournament(code) });
});

// API: 大会開始
app.post('/api/tournaments/:code/start', async (req, res) => {
  const { code } = req.params;
  const tournament = manager.getTournament(code);

  if (!tournament) {
    return res.status(404).json({ error: '大会が見つかりません' });
  }

  if (!manager.startTournament(code)) {
    return res.status(400).json({ error: '大会を開始できません' });
  }

  await manager.cleanupOldTournaments();
  await manager.save();

  res.json({ success: true, tournament: manager.getTournament(code) });
});

// API: 大会更新
app.put('/api/tournaments/:code', async (req, res) => {
  const { code } = req.params;
  const updates = req.body;

  const tournament = manager.getTournament(code);
  if (!tournament) {
    return res.status(404).json({ error: '大会が見つかりません' });
  }

  if (!manager.updateTournament(code, updates)) {
    return res.status(400).json({ error: '大会を更新できません' });
  }

  await manager.cleanupOldTournaments();
  await manager.save();

  res.json({ success: true, tournament: manager.getTournament(code) });
});

// サーバー起動
async function startServer() {
  await manager.load();
  await manager.cleanupOldTournaments();
  await manager.save();

  // 定期削除: 1時間ごとに古い大会をクリーンアップ
  setInterval(async () => {
    try {
      await manager.cleanupOldTournaments();
      await manager.save();
    } catch (e) {
      console.error('cleanupOldTournaments failed:', e);
    }
  }, 1000 * 60 * 60);

  app.listen(PORT, () => {
    console.log(`TCGマッチングシステム サーバー起動: http://localhost:${PORT}`);
    console.log('ブラウザで http://localhost:3000 を開いてください');
  });
}

startServer().catch(err => {
  console.error('サーバー起動エラー:', err);
  process.exit(1);
});
