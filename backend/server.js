const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
// Intentar usar bcrypt nativo; si falla (p. ej., en Windows sin binarios), usar bcryptjs
let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (e) {
  console.warn('bcrypt native module not available, falling back to bcryptjs:', e?.message || e);
  bcrypt = require('bcryptjs');
}
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000; // Cambiar a puerto 3000 para evitar conflictos
const SECRET_KEY = process.env.SECRET_KEY || 'aA3f9Kq7vX_2eL9zQh6sBnYpRt8uVz1w';
// Centro único solicitado por el usuario (usar exactamente este texto)
const DEFAULT_CENTER = 'intermediario de reciclaje S.A.S';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..'))); // Servir archivos estáticos desde la raíz

// Healthcheck
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Manejo global de errores no capturados
process.on('uncaughtException', (err) => {
  // No terminar el proceso para evitar caídas silenciosas en producción
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  // Registrar sin finalizar el proceso; investigar en logs
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Materiales permitidos (nuevo set)
const ALLOWED_MATERIALS = [
  'Tetra Pak',
  'Plástico PP',
  'Aluminio'
];

// Catálogo de objetos por material (para siembra y backfill de items)
const ITEM_BY_MATERIAL = {
  'Tetra Pak': ['Envase Tetra Pak', 'Caja Tetra Pak'],
  'Plástico PP': ['Tapa PP', 'Envase PP', 'Vaso PP'],
  'Aluminio': ['Lata de aluminio', 'Envase de aluminio']
};

// Normalización de materiales al set permitido
const MATERIAL_MAP_ES = {
  // Tetra Pak
  'tetrapak': 'Tetra Pak', 'tetra pak': 'Tetra Pak', 'tetra-pak': 'Tetra Pak', 'tetra': 'Tetra Pak',
  // PP
  'pp': 'Plástico PP', 'plastico pp': 'Plástico PP', 'plástico pp': 'Plástico PP', 'plastic pp': 'Plástico PP',
  // Icopor (poliestireno expandido)
  'icopor': 'Icopor', 'icopor (eps)': 'Icopor', 'icopor eps': 'Icopor', 'icopor/poliespuma': 'Icopor', 'icopor-espuma': 'Icopor', 'anime': 'Icopor', 'unicel': 'Icopor',
  // Aluminio
  'aluminio': 'Aluminio', 'aluminum': 'Aluminio', 'lata': 'Aluminio', 'latas': 'Aluminio', 'envase de aluminio': 'Aluminio', 'envases de aluminio': 'Aluminio'
};

function normalizeMaterialToSpanish(input) {
  if (!input) return 'Otro';
  const key = String(input).trim().toLowerCase();
  const mapped = MATERIAL_MAP_ES[key];
  if (mapped) return mapped;
  // Si no está en el mapa, intentar heurísticas simples
  if (key.includes('tetra')) return 'Tetra Pak';
  if (key.includes(' pp')) return 'Plástico PP';
  if (key.includes('icopor') || key.includes('unicel') || key.includes('anime')) return 'Icopor';
  if (key.includes('aluminio') || key.includes('aluminum') || key.includes('lata')) return 'Aluminio';
  return 'Otro';
}

function capitalizeFirst(str) {
  return str.length ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

// Función para calcular puntos por objeto (unidad) según el material normalizado
// Nuevo esquema de puntos (por unidad):
//  - Tetra Pak: 6
//  - Plástico PET: 5
//  - Plástico PP: 4
//  - Icopor: 2
//  - Cartón/Papel: 3
//  - Otro: 1
function calculatePoints(material, quantity) {
  const normalized = normalizeMaterialToSpanish(material);
  const pointsPerItem = {
    'Tetra Pak': 6,
    'Plástico PP': 4,
    'Aluminio': 5,
    'Otro': 1
  };
  const rate = pointsPerItem[normalized] || 1;
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  return qty * rate;
}

function getFromDate(req) {
  const from = req.query.from;
  if (!from) return null;
  // Expecting YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) return from;
  return null;
}

// Base de datos
const db = new sqlite3.Database('./aula_eco_new.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    initDatabase();
  }
});

// Inicializar base de datos
function initDatabase() {
  db.serialize(() => {
    // Tabla de usuarios
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'user'
    )`);

    // Tabla de reciclajes
    db.run(`CREATE TABLE IF NOT EXISTS recyclings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      material TEXT,
      kg REAL,
      points INTEGER,
      date TEXT,
      center TEXT,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Intentar añadir columna opcional 'item' (tipo de objeto). Si ya existe, ignorar error.
    db.run(`ALTER TABLE recyclings ADD COLUMN item TEXT`, (e) => {
      if (e && !String(e.message).includes('duplicate column')) {
        console.warn('ALTER TABLE add item column warning:', e.message);
      }
    });

  // Insertar/actualizar usuarios de ejemplo con nombres solicitados
  const saltRounds = 10;
  const adminPassword = bcrypt.hashSync('admin123', saltRounds);
  const userPassword = bcrypt.hashSync('user123', saltRounds);

  // IDs fijos para que los datos de reciclaje apunten a 2..4
  db.run(`INSERT OR REPLACE INTO users (id, username, password, role) VALUES (1, 'Santiago', ?, 'admin')`, [adminPassword]);
  db.run(`INSERT OR REPLACE INTO users (id, username, password, role) VALUES (2, 'Julian', ?, 'user')`, [userPassword]);
  db.run(`INSERT OR REPLACE INTO users (id, username, password, role) VALUES (3, 'Anita', ?, 'user')`, [userPassword]);
  db.run(`INSERT OR REPLACE INTO users (id, username, password, role) VALUES (4, 'Mauricio', ?, 'user')`, [userPassword]);

  // Preparar datos de ejemplo con materiales permitidos
  ensureSampleData();
  // Forzar que todos los registros utilicen el centro único
  enforceSingleCenter();
  // Asegurar que todos los registros tengan 'item' rellenado
  backfillItemsIfMissing();

    console.log('Database initialized successfully');
  });
}

  // Cargar datos de ejemplo con el nuevo set de materiales.
  function ensureSampleData() {
    db.get('SELECT COUNT(*) as total FROM recyclings', (err, row) => {
      if (err) { console.error('Error counting recyclings:', err.message); return; }
      const total = row?.total || 0;
      if (total === 0) {
        return populateSampleDataV2();
      }
      // Verificar integridad (materiales válidos y máx 5 por usuario)
      db.all('SELECT DISTINCT material FROM recyclings', (e2, rows) => {
        if (e2) { console.error('Error reading materials:', e2.message); return; }
        const allowed = new Set(ALLOWED_MATERIALS);
        const hasInvalid = rows.some(r => !allowed.has(normalizeMaterialToSpanish(r.material)));
        db.all('SELECT user_id, COUNT(*) as c FROM recyclings GROUP BY user_id', (e3, counts) => {
          if (e3) { console.error('Error counting per user:', e3.message); return; }
          const overLimit = counts.some(r => r.c > 5);
          const users = counts.map(r => r.user_id);
          const wrongUsers = users.some(u => ![2,3,4].includes(u));
          // Detectar registros con cantidad no entera (modo antiguo en kg)
          db.get('SELECT COUNT(*) as nonInt FROM recyclings WHERE ABS(kg - CAST(kg AS INTEGER)) > 0.0001', (e4, r4) => {
            const hasDecimalQty = r4 && r4.nonInt > 0;
            const needRebuild = hasInvalid || overLimit || wrongUsers || total !== 15 || hasDecimalQty;
            if (needRebuild) {
            console.log('Rebuilding recyclings dataset to enforce new policy (max 5 per user, allowed materials)...');
            db.run('DELETE FROM recyclings', [], (e5) => {
              if (e5) { console.error('Error clearing recyclings:', e5.message); return; }
              populateSampleDataV2();
            });
            } else {
              // Normalizar nombres a canónicos por si acaso
              db.all('SELECT id, material FROM recyclings', (e6, all) => {
                if (e6) return;
                all.forEach(r => {
                  const m = normalizeMaterialToSpanish(r.material);
                  if (ALLOWED_MATERIALS.includes(m)) {
                    db.run('UPDATE recyclings SET material = ? WHERE id = ?', [m, r.id]);
                  }
                });
              });
            }
          });
        });
      });
    });
  }

  // Variante con máximo 5 registros por usuario y distribución variada en el tiempo
  function populateSampleDataV2() {
    const centers = [DEFAULT_CENTER];
    const materials = ALLOWED_MATERIALS;
    const users = [2,3,4]; // admin es 1
    const entries = [];
    function randomInt(min, max) { return Math.floor(Math.random()*(max-min+1))+min; }
    function pick(arr) { return arr[Math.floor(Math.random()*arr.length)]; }
    const now = new Date();
    function format(d){ return d.toISOString().slice(0,10); }

    const ITEM_BY_MATERIAL = {
      'Tetra Pak': ['Envase Tetra Pak', 'Caja Tetra Pak'],
      'Plástico PP': ['Tapa PP', 'Envase PP', 'Vaso PP'],
      'Aluminio': ['Lata de aluminio', 'Envase de aluminio']
    };

    users.forEach(uid => {
      let dates = [];
      if (uid === 2) {
        // Agrupados en la última semana (5 registros en distintos días de los últimos 7)
        for (let i=0;i<5;i++) {
          const d = new Date(now.getTime() - Math.floor(Math.random()*7)*24*3600*1000);
          dates.push(format(d));
        }
      } else if (uid === 3) {
        // Distribuidos en el último mes (5 semanas diferentes)
        for (let i=0;i<5;i++) {
          const d = new Date(now.getTime() - Math.floor(Math.random()*30)*24*3600*1000);
          dates.push(format(d));
        }
      } else if (uid === 4) {
        // Distribuidos en el último año (meses distintos)
        for (let i=0;i<5;i++) {
          const monthOffset = Math.floor(Math.random()*12);
          const d = new Date(now);
          d.setMonth(d.getMonth() - monthOffset);
          d.setDate(Math.min(28, Math.ceil(Math.random()*28)));
          dates.push(format(d));
        }
      }
      dates.forEach(date => {
        const material = pick(materials);
        const qty = randomInt(1, 8);
        const center = pick(centers);
        const item = pick(ITEM_BY_MATERIAL[material]);
        entries.push({ user_id: uid, material, qty, item, points: calculatePoints(material, qty), date, center });
      });
    });

    entries.forEach(d => {
      // Guardamos 'qty' en la columna 'kg' existente para evitar migraciones destructivas
      db.run('INSERT INTO recyclings (user_id, material, kg, points, date, center, item) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [d.user_id, d.material, d.qty, d.points, d.date, d.center, d.item]);
    });
    console.log(`Inserted ${entries.length} sample recycling records`);
  }

// Iniciar servidor después de inicializar la base de datos
startServer();

// Middleware de autenticación
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Rutas de autenticación
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY);
    res.json({ token, role: user.role });
  });
});

// Rutas de reciclajes
app.get('/api/me/records', authenticateToken, (req, res) => {
  const from = getFromDate(req);
  const whereSql = from ? 'AND date >= ?' : '';
  const params = from ? [req.user.id, from] : [req.user.id];
  db.all(`SELECT * FROM recyclings WHERE user_id = ? ${whereSql}`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const items = rows.map(r => ({ ...r, material: normalizeMaterialToSpanish(r.material) }));
    res.json({ items });
  });
});

app.post('/api/recyclings', authenticateToken, (req, res) => {
  // Aceptamos quantity (preferido) o kg (legacy). 'item' opcional.
  const { material, quantity, kg, date, center, item } = req.body;

  // Normalizar material a Español y calcular puntos
  const materialEs = normalizeMaterialToSpanish(material);
  if (!ALLOWED_MATERIALS.includes(materialEs)) {
    return res.status(400).json({ error: 'Material no permitido. Use uno de: ' + ALLOWED_MATERIALS.join(', ') });
  }
  const qty = Math.max(0, Math.floor(Number(quantity != null ? quantity : kg) || 0));
  if (!qty) return res.status(400).json({ error: 'La cantidad debe ser un entero mayor o igual a 1' });
  const points = calculatePoints(materialEs, qty);

  // Enforce single center regardless of input
  const centerName = DEFAULT_CENTER;
  const fallbackItem = (ITEM_BY_MATERIAL[materialEs] && ITEM_BY_MATERIAL[materialEs][0]) || null;
  const itemName = (item && String(item).trim().length) ? String(item).trim() : fallbackItem;
  db.run('INSERT INTO recyclings (user_id, material, kg, points, date, center, item) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.user.id, materialEs, qty, points, date, centerName, itemName], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, points: points, quantity: qty });
    });
});

// Rutas de estadísticas
app.get('/api/stats', authenticateToken, (req, res) => {
  const from = getFromDate(req);
  const isAdmin = req.user.role === 'admin';
  const where = [];
  const params = [];
  if (!isAdmin) { where.push('user_id = ?'); params.push(req.user.id); }
  if (from) { where.push('date >= ?'); params.push(from); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  db.all(`SELECT material, kg, points FROM recyclings ${whereSql}`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const agg = {};
    rows.forEach(r => {
      const m = normalizeMaterialToSpanish(r.material);
      agg[m] = agg[m] || { material: m, total_qty: 0, total_points: 0 };
      agg[m].total_qty += Number(r.kg) || 0; // usamos columna 'kg' como cantidad (unidades)
      agg[m].total_points += Number(r.points) || 0;
    });
    res.json({ stats: Object.values(agg) });
  });
});

// Normalizar centros existentes a DEFAULT_CENTER para todos los registros
function enforceSingleCenter() {
  try {
    db.run('UPDATE recyclings SET center = ?', [DEFAULT_CENTER], (e) => {
      if (e) console.warn('Center normalization warning:', e.message);
    });
  } catch (e) {
    console.warn('Center normalization error:', e.message);
  }
}

// Backfill de 'item' para registros existentes sin valor
function backfillItemsIfMissing() {
  try {
    db.all("SELECT id, material, item FROM recyclings WHERE item IS NULL OR TRIM(item) = ''", (err, rows) => {
      if (err) { console.warn('Backfill items warning:', err.message); return; }
      if (!rows || rows.length === 0) return; // Nada por hacer
      rows.forEach(r => {
        const m = normalizeMaterialToSpanish(r.material);
        const catalog = ITEM_BY_MATERIAL[m] || [];
        const defaultItem = catalog.length ? catalog[0] : 'Objeto reciclado';
        db.run('UPDATE recyclings SET item = ?, material = ? WHERE id = ?', [defaultItem, m, r.id], (e2) => {
          if (e2) console.warn('Backfill update warning:', e2.message);
        });
      });
    });
  } catch (e) {
    console.warn('Backfill items error:', e.message);
  }
}

// Estadísticas globales para admin
app.get('/api/global-stats', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
  const from = getFromDate(req);
  const whereSql = from ? 'WHERE date >= ?' : '';
  const params = from ? [from] : [];
  db.get(`SELECT SUM(kg) as total_qty, SUM(points) as total_points, COUNT(*) as total_records FROM recyclings ${whereSql}` , params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    // Equivalentes aproximados por unidad (heurísticos)
    const totalQty = row.total_qty || 0;
    const treesSaved = Math.round(totalQty / 50); // 50 objetos = 1 árbol (aprox.)
    const energySaved = Math.round(totalQty * 1); // 1 kWh por 1 objeto (aprox.)
    const waterSaved = Math.round(totalQty * 200); // 200L por objeto (aprox.)
    res.json({
      total_qty: totalQty,
      total_points: row.total_points || 0,
      trees_saved: treesSaved,
      energy_saved: energySaved,
      water_saved: waterSaved,
      total_records: row.total_records || 0
    });
  });
});

// Evolución
app.get('/api/evolution', authenticateToken, (req, res) => {
  const from = getFromDate(req);
  const isAdmin = req.user.role === 'admin';
  const where = [];
  const params = [];
  if (!isAdmin) { where.push('user_id = ?'); params.push(req.user.id); }
  if (from) { where.push('date >= ?'); params.push(from); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  db.all(`SELECT strftime('%Y-%m', date) as month, SUM(kg) as total_qty FROM recyclings ${whereSql} GROUP BY strftime('%Y-%m', date) ORDER BY month`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ evolution: rows });
  });
});

// Ruta pública: ver todos los reciclajes (sin info de usuario)
app.get('/api/public/recyclings', (req, res) => {
  const from = getFromDate(req);
  const whereSql = from ? 'WHERE date >= ?' : '';
  const params = from ? [from] : [];
  db.all(`SELECT id, material, kg, points, date, center, item FROM recyclings ${whereSql} ORDER BY date DESC`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // Normalizar material a Español en respuesta pública
    const items = rows.map(r => ({ ...r, material: normalizeMaterialToSpanish(r.material) }));
    res.json({ items });
  });
});

// Ruta para admin: ver todos los reciclajes
app.get('/api/admin/recyclings', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  const from = getFromDate(req);
  const whereSql = from ? 'WHERE r.date >= ?' : '';
  const params = from ? [from] : [];
  db.all(`SELECT r.*, u.username FROM recyclings r JOIN users u ON r.user_id = u.id ${whereSql}`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const items = rows.map(r => ({ ...r, material: normalizeMaterialToSpanish(r.material) }));
    res.json({ items });
  });
});

// Iniciar servidor solo después de que la base de datos esté lista
function startServer() {
  try {
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log('AULA-ECO backend server started successfully');
    });
    server.on('error', (err) => {
      console.error('Server listen error:', err);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
  }
}