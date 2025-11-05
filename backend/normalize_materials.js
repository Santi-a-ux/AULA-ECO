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
  const dest = path.join(BACKUPS_DIR, `${DB_NAME.replace('.db','')}_normalize_backup_${ts}.db`);
  fs.copyFileSync(DB_PATH, dest);
  return dest;
}

function openDb() { return new sqlite3.Database(DB_PATH); }
function allAsync(db, sql, params=[]) { return new Promise((res, rej) => db.all(sql, params, (err, rows) => { if (err) return rej(err); res(rows); })); }
function runAsync(db, sql, params=[]) { return new Promise((res, rej) => db.run(sql, params, function(err){ if (err) return rej(err); res(this.changes); })); }

function mapToAllowed(mat) {
  if (!mat) return 'Plástico PP';
  const m = String(mat).trim().toLowerCase();
  if (m.includes('tetra')) return 'Tetra Pak';
  if (m.includes('pp')) return 'Plástico PP';
  if (m.includes('plástico') || m.includes('plastico')) return 'Plástico PP';
  if (m.includes('pet')) return 'Plástico PP';
  if (m.includes('plastic')) return 'Plástico PP';
  if (m.includes('alumin') || m.includes('lata')) return 'Aluminio';
  // Some synonyms mapping
  if (m.includes('metal')) return 'Aluminio';
  // Default fallback to Plástico PP
  return 'Plástico PP';
}

(async () => {
  if (!fs.existsSync(DB_PATH)) { console.error('DB not found at', DB_PATH); process.exit(1); }
  console.log('Backing up DB before normalization...');
  const backup = backupDb();
  console.log('Backup created at', backup);

  const db = openDb();
  try {
    const distinct = await allAsync(db, 'SELECT material, COUNT(*) as cnt FROM recyclings GROUP BY material ORDER BY cnt DESC');
    console.log('Distinct materials before:');
    distinct.forEach(d => console.log(` - ${d.material} (${d.cnt})`));

    // For each distinct material not in allowed set, map and update
    const allowed = new Set(['Tetra Pak','Plástico PP','Aluminio']);
    for (const d of distinct) {
      const mat = d.material;
      if (!allowed.has(mat)) {
        const mapped = mapToAllowed(mat);
        console.log(`Mapping '${mat}' -> '${mapped}' (rows: ${d.cnt})`);
        const changes = await runAsync(db, 'UPDATE recyclings SET material = ? WHERE material = ?', [mapped, mat]);
        console.log(` Updated rows: ${changes}`);
      }
    }

    const after = await allAsync(db, 'SELECT material, COUNT(*) as cnt FROM recyclings GROUP BY material ORDER BY cnt DESC');
    console.log('\nDistinct materials after normalization:');
    after.forEach(a => console.log(` - ${a.material} (${a.cnt})`));

    db.close();
    console.log('\nNormalization complete.');
  } catch (err) {
    console.error('Error during normalization:', err);
    db.close();
    process.exit(1);
  }
})();
