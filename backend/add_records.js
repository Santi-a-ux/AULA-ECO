const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_NAME = 'aula_eco_new.db';
const dbPath = path.join(__dirname, DB_NAME);
const backupsDir = path.join(__dirname, '..', 'backups_db');

function ensureBackupsDir() {
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
}

function backupDb() {
  ensureBackupsDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupsDir, `${DB_NAME.replace('.db','')}_backup_${ts}.db`);
  fs.copyFileSync(dbPath, dest);
  return dest;
}

function openDb() {
  return new sqlite3.Database(dbPath);
}

function calcPoints(material, qty) {
  const m = (material || '').toLowerCase();
  // Use same mapping as server.js: Tetra Pak=6, Plástico PP=4, Aluminio=5, Otro=1
  if (m.includes('tetra')) return qty * 6;
  if (m.includes('pp')) return qty * 4;
  if (m.includes('aluminio') || m.includes('aluminum') || m.includes('lata')) return qty * 5;
  return qty * 1;
}

async function run() {
  if (!fs.existsSync(dbPath)) {
    console.error('Database not found at', dbPath);
    process.exit(1);
  }

  console.log('Creating backup of DB...');
  const backupFile = backupDb();
  console.log('Backup created at', backupFile);

  const db = openDb();

  function runAsync(sql, params=[]) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    });
  }

  function allAsync(sql, params=[]) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  try {
    // Show counts before
    const beforeUsers = await allAsync('SELECT COUNT(*) as c FROM users');
    const beforeRecs = await allAsync('SELECT COUNT(*) as c FROM recyclings');
    console.log('Before: users=', beforeUsers[0].c, 'recyclings=', beforeRecs[0].c);

    // Prepare sample new entries (20 entries-ish)
    const sampleEntries = [];
    const materials = ['Tetra Pak', 'Plástico PP', 'Aluminio'];
    const itemsByMaterial = {
      'Tetra Pak': ['Envase Tetra Pak', 'Caja Tetra Pak'],
      'Plástico PP': ['Envase PP', 'Vaso PP', 'Tapa PP'],
      'Aluminio': ['Lata de aluminio', 'Envase de aluminio']
    };
    const users = [2,3,4,5]; // assuming these users exist in this DB (inspect showed up to user 5)

    const now = new Date();
    function fmt(d) { return d.toISOString().slice(0,10); }

    for (let i=0;i<20;i++) {
      const user = users[i % users.length];
      const material = materials[i % materials.length];
      const qty = Math.floor(Math.random()*8) + 1; // 1..8
      const item = itemsByMaterial[material][Math.floor(Math.random()*itemsByMaterial[material].length)];
      // spread dates over last 90 days
      const d = new Date(now.getTime() - Math.floor(Math.random()*90)*24*3600*1000);
      const date = fmt(d);
      const points = calcPoints(material, qty);
      const center = 'intermediario de reciclaje S.A.S';
      sampleEntries.push({ user_id: user, material, qty, item, points, date, center });
    }

    // Insert entries
    console.log('Inserting', sampleEntries.length, 'new records...');
    for (const e of sampleEntries) {
      await runAsync('INSERT INTO recyclings (user_id, material, kg, points, date, center, item) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [e.user_id, e.material, e.qty, e.points, e.date, e.center, e.item]);
    }

    const afterUsers = await allAsync('SELECT COUNT(*) as c FROM users');
    const afterRecs = await allAsync('SELECT COUNT(*) as c FROM recyclings');
    console.log('After: users=', afterUsers[0].c, 'recyclings=', afterRecs[0].c);

    // Show per-material aggregates
    const agg = await allAsync("SELECT material, COUNT(*) as cnt, SUM(kg) as total_qty FROM recyclings GROUP BY material ORDER BY cnt DESC");
    console.log('Aggregates by material:', agg);

    db.close();
    console.log('Done.');
  } catch (err) {
    console.error('Error during DB operation:', err);
    db.close();
    process.exit(1);
  }
}

run();
