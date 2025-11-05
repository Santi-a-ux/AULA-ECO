const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

function findDbFiles(dir, results = []) {
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of list) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // skip node_modules and .git
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      findDbFiles(full, results);
    } else if (entry.isFile() && entry.name.endsWith('.db')) {
      results.push(full);
    }
  }
  return results;
}

function openDb(file) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(err);
      resolve(db);
    });
  });
}

function allAsync(db, sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function getAsync(db, sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

async function inspectDb(file) {
  const stats = fs.statSync(file);
  const size = stats.size;
  let db;
  try {
    db = await openDb(file);
  } catch (err) {
    console.error(`Failed to open ${file}:`, err.message);
    return { file, size, error: err.message };
  }
  try {
    const tables = await allAsync(db, "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const tableSummaries = [];
    for (const t of tables) {
      let count = null;
      try {
        const row = await getAsync(db, `SELECT COUNT(*) as c FROM ${t.name}`);
        count = row ? row.c : null;
      } catch (e) {
        // some views or special tables may fail
        count = null;
      }
      tableSummaries.push({ name: t.name, type: t.type, count });
    }
    // Grab a few sample rows from commonly interesting tables
    const samples = {};
    const interesting = ['users','recyclings','sqlite_sequence'];
    for (const tn of interesting) {
      try {
        const rows = await allAsync(db, `SELECT * FROM ${tn} LIMIT 5`);
        samples[tn] = rows;
      } catch (e) {
        // ignore
      }
    }
    db.close();
    return { file, size, tables: tableSummaries, samples };
  } catch (err) {
    db.close();
    return { file, size, error: err.message };
  }
}

(async () => {
  const root = path.resolve(path.join(__dirname, '..'));
  console.log('Scanning for .db files under', root);
  const dbFiles = findDbFiles(root);
  if (!dbFiles.length) {
    console.log('No .db files found');
    return;
  }
  for (const f of dbFiles) {
    console.log('\n---- Inspecting', f, '----');
    try {
      const info = await inspectDb(f);
      if (info.error) {
        console.log('Error:', info.error);
        continue;
      }
      console.log('Size (bytes):', info.size);
      if (info.tables && info.tables.length) {
        console.log('Tables:');
        info.tables.forEach(t => console.log(` - ${t.name} (${t.type}) rows=${t.count}`));
      } else {
        console.log('No tables found');
      }
      console.log('Samples:');
      for (const k of Object.keys(info.samples)) {
        console.log(` Table ${k}:`, info.samples[k].length ? JSON.stringify(info.samples[k], null, 2) : 'empty or not present');
      }
    } catch (err) {
      console.error('Failed to inspect', f, err.message);
    }
  }
})();
