
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'tournaments.json');
const BACKUP_FILE = path.join(__dirname, 'backup.json');


// ミドルウェア
app.use(cors());
app.use(express.json());
// フロントファイルは public フォルダに配置して配信する
app.use(express.static('public'));

// 大会コードの正規化（全角/半角・大文字/小文字の違いを吸収。public/app.js と同じ処理）
function normalizeCode(code) {
  return String(code || '').normalize('NFKC').trim().toUpperCase();
}

// 大会コードとして使えるか（2〜30文字、空白・制御文字と / \ ? # % < > " ' ` は不可）
function isValidCode(code) {
  const length = Array.from(code).length;
  return length >= 2 && length <= 30 && !/[\s\/\\?#%<>"'`\u0000-\u001f\u007f]/.test(code);
}

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

  createTournament(name, format, customCode = null) {
    let code;
    if (customCode) {
      if (this.tournaments[customCode]) return null;
      code = customCode;
    } else {
      do {
        code = this.generateCode();
      } while (this.tournaments[code]);
    }

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
      byeCounts: {}, // スイスドロー形式で、各プレイヤーが受けたBYE回数を追跡
      pairHistory: []
    };

    return code;
  }

  getTournament(code) {
    const tournament = this.tournaments[code] || null;
    if (!tournament) return null;

    if (!tournament.byeCounts) {
      tournament.byeCounts = {};
    }

    return tournament;
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
    tournament.byeCounts[playerName] = 0;

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
  const customCode = normalizeCode(req.body.code);

  if (!name || !format) {
    return res.status(400).json({ error: '名前と形式が必要です' });
  }

  if (customCode && !isValidCode(customCode)) {
    return res.status(400).json({ error: '大会コードは2〜30文字で、空白と記号 / \\ ? # % < > " \' ` は使えません' });
  }

  // 期限切れの大会が残っているとコードが使えないため、先に削除しておく
  await manager.cleanupOldTournaments();

  const code = manager.createTournament(name, format, customCode || null);
  if (!code) {
    return res.status(409).json({ error: 'この大会コードは既に使われています' });
  }
  await manager.save();

  res.json({ code, tournament: manager.getTournament(code) });
});

// API: 大会取得
app.get('/api/tournaments/:code', (req, res) => {
  const code = normalizeCode(req.params.code);
  const tournament = manager.getTournament(code);

  if (!tournament) {
    return res.status(404).json({ error: '大会が見つかりません' });
  }

  res.json(tournament);
});

// API: 大会に参加
app.post('/api/tournaments/:code/join', async (req, res) => {
  const code = normalizeCode(req.params.code);
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
  const code = normalizeCode(req.params.code);
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
  const code = normalizeCode(req.params.code);
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
