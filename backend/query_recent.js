const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'BDESTASI.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.get('SELECT COUNT(*) as c FROM recyclings', (err, row) => {
    if (err) { console.error('Count error', err); return; }
    console.log('Total recyclings:', row.c);

    db.all('SELECT id, user_id, material, kg, points, date, item FROM recyclings ORDER BY id DESC LIMIT 15', (err2, rows) => {
      if (err2) { console.error('Select error', err2); return; }
      console.log('\nÚltimas 15 filas (ordenadas por id desc):');
      rows.forEach(r => console.log(JSON.stringify(r)));
      db.close();
    });
  });
});
