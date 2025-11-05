const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_NAME = 'BDESTASI.db';
const DB_PATH = path.join(__dirname, DB_NAME);
const BACKUPS_DIR = path.join(__dirname, '..', 'backups_db');

function ensureBackupsDir() { if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true }); }
function backupDb() {
  ensureBackupsDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(BACKUPS_DIR, `${DB_NAME.replace('.db','')}_backup_${ts}.db`);
  fs.copyFileSync(DB_PATH, dest);
  return dest;
}

function openDb() { return new sqlite3.Database(DB_PATH); }
function runAsync(db, sql, params=[]) { return new Promise((res, rej) => db.run(sql, params, function(err){ if (err) return rej(err); res(this.lastID); })); }
function allAsync(db, sql, params=[]) { return new Promise((res, rej) => db.all(sql, params, (err, rows) => { if (err) return rej(err); res(rows); })); }

function calcPoints(material, qty) {
  const m = (material || '').toLowerCase();
  if (m.includes('tetra')) return qty * 6;
  if (m.includes('pp')) return qty * 4;
  if (m.includes('aluminio') || m.includes('aluminum') || m.includes('lata')) return qty * 5;
  return qty * 1;
}

function pad(n){ return n < 10 ? '0'+n : ''+n; }
function formatSqlDate(d){ // YYYY-MM-DD HH:MM:SS
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function main(){
  if (!fs.existsSync(DB_PATH)) { console.error('DB file not found:', DB_PATH); process.exit(1); }
  console.log('Backing up DB...');
  const backup = backupDb();
  console.log('Backup created at', backup);

  const db = openDb();
  try {
    const before = await allAsync(db, 'SELECT COUNT(*) as c FROM recyclings');
    console.log('Before recyclings count =', before[0].c);
    const users = await allAsync(db, 'SELECT id, username FROM users');
    console.log('Users found:', users.map(u => `${u.id}:${u.username}`).join(', '));

    const materials = ['Tetra Pak','Plástico PP','Aluminio','Cartón','Otro','Vidrio','Plastic PET','Papel'];
    const itemsByMaterial = {
      'Tetra Pak':['Envase Tetra Pak','Caja Tetra Pak'],
      'Plástico PP':['Envase PP','Vaso PP','Tapa PP'],
      'Aluminio':['Lata de aluminio','Envase de aluminio'],
      'Cartón':['Caja','Cartón'],
      'Otro':['Objeto reciclado'],
      'Vidrio':['Botella vidrio'],
      'Plastic PET':['Botella PET'],
      'Papel':['Papel','Periódico']
    };

    const now = new Date();
    let totalInserted = 0;
    for (const u of users) {
      for (let i=0;i<30;i++) {
        // spread across last 540 days to get months/years variety
        const daysBack = Math.floor(Math.random()*540);
        const d = new Date(now.getTime() - daysBack*24*3600*1000);
        // random hour/min/sec
        d.setHours(Math.floor(Math.random()*24));
        d.setMinutes(Math.floor(Math.random()*60));
        d.setSeconds(Math.floor(Math.random()*60));
        const dateStr = formatSqlDate(d);
        const material = materials[Math.floor(Math.random()*materials.length)];
        const itemList = itemsByMaterial[material] || ['Objeto reciclado'];
        const item = itemList[Math.floor(Math.random()*itemList.length)];
        const qty = Math.floor(Math.random()*12)+1; // 1..12
        const points = calcPoints(material, qty);
        const center = 'intermediario de reciclaje S.A.S';

        await runAsync(db, 'INSERT INTO recyclings (user_id, material, kg, points, date, center, item) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [u.id, material, qty, points, dateStr, center, item]);
        totalInserted++;
      }
      console.log(`Inserted 30 records for user ${u.id} (${u.username})`);
    }

    const after = await allAsync(db, 'SELECT COUNT(*) as c FROM recyclings');
    console.log('After recyclings count =', after[0].c);
    console.log('Total inserted =', totalInserted);

    // show simple per-user counts
    const perUser = await allAsync(db, 'SELECT user_id, COUNT(*) as c FROM recyclings GROUP BY user_id ORDER BY user_id');
    console.log('Per-user counts:'); perUser.forEach(r => console.log(` user ${r.user_id}: ${r.c}`));

    db.close();
    console.log('Done');
  } catch (err) {
    console.error('Error:', err);
    db.close();
    process.exit(1);
  }
}

main();
