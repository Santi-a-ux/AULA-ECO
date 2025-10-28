const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./aula_eco_new.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    return;
  }
  console.log('Connected to SQLite database.');
});

// Verificar usuarios
db.all('SELECT id, username, role FROM users', (err, users) => {
  if (err) {
    console.error('Error querying users:', err.message);
  } else {
    console.log('Users in database:', users.length);
    users.forEach(user => console.log(`- ${user.username} (${user.role})`));
  }
});

// Verificar reciclajes
db.all('SELECT COUNT(*) as total FROM recyclings', (err, result) => {
  if (err) {
    console.error('Error counting recyclings:', err.message);
  } else {
    console.log('Total recycling records:', result[0].total);
  }
});

// Verificar algunos registros de reciclaje
db.all('SELECT r.material, r.kg, r.points, u.username FROM recyclings r JOIN users u ON r.user_id = u.id LIMIT 5', (err, records) => {
  if (err) {
    console.error('Error querying records:', err.message);
  } else {
    console.log('Sample recycling records:');
    records.forEach(record => console.log(`- ${record.username}: ${record.material} ${record.kg}kg (${record.points} points)`));
  }

  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed.');
    }
  });
});