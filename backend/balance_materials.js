const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_NAME = 'BDESTASI.db';
const DB_PATH = path.join(__dirname, DB_NAME);
const BACKUPS_DIR = path.join(__dirname, '..', 'backups_db');

function ensureBackupsDir() { if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true }); }
function backupDb() { ensureBackupsDir(); const ts = new Date().toISOString().replace(/[:.]/g,'-'); const dest = path.join(BACKUPS_DIR, `${DB_NAME.replace('.db','')}_balance_backup_${ts}.db`); fs.copyFileSync(DB_PATH, dest); return dest; }

function openDb() { return new sqlite3.Database(DB_PATH); }
function allAsync(db, sql, params=[]) { return new Promise((res, rej) => db.all(sql, params, (err, rows) => { if (err) return rej(err); res(rows); })); }
function runAsync(db, sql, params=[]) { return new Promise((res, rej) => db.run(sql, params, function(err){ if (err) return rej(err); res(this.changes || this.lastID); })); }

function pointsFor(material, qty) {
  const m = (material||'').toLowerCase();
  if (m.includes('tetra')) return qty*6;
  if (m.includes('pp')) return qty*4;
  if (m.includes('alumin')) return qty*5;
  return qty*1;
}

(async () => {
  if (!fs.existsSync(DB_PATH)) { console.error('DB not found at', DB_PATH); process.exit(1); }
  console.log('Backing up DB before balancing...');
  const b = backupDb();
  console.log('Backup:', b);

  const db = openDb();
  try {
    const counts = await allAsync(db, "SELECT material, COUNT(*) as c FROM recyclings GROUP BY material ORDER BY c DESC");
    console.log('Counts before:'); counts.forEach(r => console.log(` - ${r.material}: ${r.c}`));
    const total = counts.reduce((s,r) => s + r.c, 0);
    const target = Math.ceil(total/3);
    console.log('Total rows:', total, 'Target per material (ceil):', target);

    const allowed = ['Tetra Pak','Plástico PP','Aluminio'];
    // build map
    const mapCounts = Object.fromEntries(counts.map(r => [r.material, r.c]));
    allowed.forEach(a => { if (!mapCounts[a]) mapCounts[a]=0; });

    // While any material > target, convert some Plástico PP to the most underrepresented material
    let changes = 0;
    // We'll prioritize reducing 'Plástico PP' only as requested
    const overMaterial = 'Plástico PP';
    let overCount = mapCounts[overMaterial] || 0;
    // List of candidate target materials ordered by lowest count
    function getUnderMaterial() {
      const arr = allowed.map(a => ({mat:a, c: mapCounts[a] || 0})).sort((x,y)=>x.c - y.c);
      return arr[0].mat;
    }

    while (overCount > target) {
      const under = getUnderMaterial();
      if (under === overMaterial) break; // nothing to do
      const need = Math.min(overCount - target, target - (mapCounts[under] || 0));
      if (need <= 0) break;
      // fetch `need` rows to update (oldest or random) from overMaterial
      // choose oldest (ORDER BY id ASC)
      const rows = await allAsync(db, `SELECT id, kg FROM recyclings WHERE material = ? ORDER BY id ASC LIMIT ?`, [overMaterial, need]);
      if (!rows.length) break;
      for (const r of rows) {
        const newPts = pointsFor(under, Math.round(Number(r.kg) || 0));
        await runAsync(db, `UPDATE recyclings SET material = ?, points = ? WHERE id = ?`, [under, newPts, r.id]);
        changes++;
        mapCounts[overMaterial] = (mapCounts[overMaterial]||0) - 1;
        mapCounts[under] = (mapCounts[under]||0) + 1;
      }
      overCount = mapCounts[overMaterial] || 0;
      console.log(`Converted ${rows.length} rows from ${overMaterial} to ${under}.`);
    }

    const after = await allAsync(db, "SELECT material, COUNT(*) as c FROM recyclings GROUP BY material ORDER BY c DESC");
    console.log('\nCounts after:'); after.forEach(r => console.log(` - ${r.material}: ${r.c}`));
    console.log('\nTotal changes made:', changes);

    db.close();
    console.log('\nBalancing complete.');
  } catch (err) {
    console.error('Error:', err);
    db.close();
    process.exit(1);
  }
})();
