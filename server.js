const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function sanitizeSegment(value) {
  return (value || 'SemNome')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9-_ .]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80) || 'SemNome';
}

function toIsoDateRangeStart(date) {
  return `${date}T00:00:00.000Z`;
}

function toIsoDateRangeEnd(date) {
  return `${date}T23:59:59.999Z`;
}

function ensurePathExists(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function openPath(targetPath) {
  if (!fs.existsSync(targetPath)) {
    throw new Error('Caminho não encontrado');
  }

  let command;
  let args;
  if (process.platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', targetPath];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [targetPath];
  } else {
    command = 'xdg-open';
    args = [targetPath];
  }

  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

function createDatabase(dbPath) {
  ensurePathExists(dbPath);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      client_number TEXT NOT NULL,
      nif TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(name, client_number, nif)
    );

    CREATE TABLE IF NOT EXISTS document_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL,
      client_number TEXT NOT NULL,
      nif TEXT NOT NULL,
      document_type TEXT NOT NULL,
      notes TEXT,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      upload_at TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      extension TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_upload_at ON documents(upload_at);
    CREATE INDEX IF NOT EXISTS idx_documents_client_name ON documents(client_name);
    CREATE INDEX IF NOT EXISTS idx_documents_nif ON documents(nif);
    CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);
  `);

  return db;
}

function createApp(config = {}) {
  const app = express();
  const dbPath = config.dbPath || path.join(__dirname, 'data', 'filemane.db');
  const documentsRoot = config.documentsRoot || path.join(__dirname, 'Documentos');
  const uploadTemp = config.uploadTemp || path.join(os.tmpdir(), 'filemane_uploads');

  fs.mkdirSync(documentsRoot, { recursive: true });
  fs.mkdirSync(uploadTemp, { recursive: true });

  const db = createDatabase(dbPath);
  const upload = multer({ dest: uploadTemp });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/dashboard', (_req, res) => {
    const stats = {
      totalDocuments: db.prepare('SELECT COUNT(*) AS count FROM documents').get().count,
      totalClients: db.prepare('SELECT COUNT(*) AS count FROM clients').get().count,
      totalTypes: db.prepare('SELECT COUNT(*) AS count FROM document_types').get().count,
    };
    res.json(stats);
  });

  app.get('/api/clients', (req, res) => {
    const query = (req.query.query || '').toString().trim();
    const stmt = query
      ? db.prepare(`
          SELECT id, name, client_number AS clientNumber, nif
          FROM clients
          WHERE name LIKE @q OR client_number LIKE @q OR nif LIKE @q
          ORDER BY name COLLATE NOCASE
          LIMIT 50
        `)
      : db.prepare(`
          SELECT id, name, client_number AS clientNumber, nif
          FROM clients
          ORDER BY name COLLATE NOCASE
          LIMIT 200
        `);

    const rows = query ? stmt.all({ q: `%${query}%` }) : stmt.all();
    res.json(rows);
  });

  app.post('/api/clients', (req, res) => {
    const name = (req.body.name || '').toString().trim();
    const clientNumber = (req.body.clientNumber || '').toString().trim();
    const nif = (req.body.nif || '').toString().trim();

    if (!name || !clientNumber || !nif) {
      return res.status(400).json({ error: 'Nome, número de cliente e NIF são obrigatórios.' });
    }

    db.prepare(
      `INSERT OR IGNORE INTO clients(name, client_number, nif) VALUES (@name, @clientNumber, @nif)`
    ).run({ name, clientNumber, nif });

    const saved = db
      .prepare('SELECT id, name, client_number AS clientNumber, nif FROM clients WHERE name = ? AND client_number = ? AND nif = ?')
      .get(name, clientNumber, nif);

    return res.status(201).json(saved);
  });

  app.get('/api/document-types', (req, res) => {
    const query = (req.query.query || '').toString().trim();
    const stmt = query
      ? db.prepare(`
          SELECT id, name
          FROM document_types
          WHERE name LIKE @q
          ORDER BY name COLLATE NOCASE
          LIMIT 50
        `)
      : db.prepare(`
          SELECT id, name
          FROM document_types
          ORDER BY name COLLATE NOCASE
          LIMIT 200
        `);

    const rows = query ? stmt.all({ q: `%${query}%` }) : stmt.all();
    res.json(rows);
  });

  app.post('/api/document-types', (req, res) => {
    const name = (req.body.name || '').toString().trim();
    if (!name) {
      return res.status(400).json({ error: 'Nome do tipo é obrigatório.' });
    }

    db.prepare('INSERT OR IGNORE INTO document_types(name) VALUES (?)').run(name);
    const saved = db.prepare('SELECT id, name FROM document_types WHERE name = ?').get(name);
    return res.status(201).json(saved);
  });

  app.post('/api/documents', upload.single('file'), async (req, res) => {
    try {
      const file = req.file;
      const clientName = (req.body.clientName || '').toString().trim();
      const clientNumber = (req.body.clientNumber || '').toString().trim();
      const nif = (req.body.nif || '').toString().trim();
      const documentType = (req.body.documentType || '').toString().trim();
      const notes = (req.body.notes || '').toString().trim();
      const saveClient = req.body.saveClient === 'true' || req.body.saveClient === true;
      const saveType = req.body.saveType === 'true' || req.body.saveType === true;

      if (!file) {
        return res.status(400).json({ error: 'Ficheiro é obrigatório.' });
      }
      if (!clientName || !clientNumber || !nif || !documentType) {
        await fsp.unlink(file.path).catch(() => {});
        return res.status(400).json({ error: 'Cliente, número, NIF e tipo de documento são obrigatórios.' });
      }

      if (saveClient) {
        db.prepare('INSERT OR IGNORE INTO clients(name, client_number, nif) VALUES (?, ?, ?)').run(clientName, clientNumber, nif);
      }
      if (saveType) {
        db.prepare('INSERT OR IGNORE INTO document_types(name) VALUES (?)').run(documentType);
      }

      const customerFolder = sanitizeSegment(clientName);
      const typeFolder = sanitizeSegment(documentType);
      const finalDir = path.join(documentsRoot, customerFolder, typeFolder);
      await fsp.mkdir(finalDir, { recursive: true });

      const sanitizedOriginal = sanitizeSegment(path.basename(file.originalname));
      const storedFileName = `${Date.now()}-${sanitizedOriginal}`;
      const finalPath = path.join(finalDir, storedFileName);

      await fsp.rename(file.path, finalPath);
      const stats = await fsp.stat(finalPath);
      const extension = path.extname(file.originalname || '').toLowerCase();
      const uploadAt = new Date().toISOString();

      const result = db
        .prepare(
          `INSERT INTO documents (
            client_name, client_number, nif, document_type, notes,
            original_name, file_path, upload_at, file_size, extension
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          clientName,
          clientNumber,
          nif,
          documentType,
          notes,
          file.originalname,
          finalPath,
          uploadAt,
          stats.size,
          extension
        );

      const saved = db
        .prepare(
          `SELECT
            id,
            original_name AS fileName,
            client_name AS clientName,
            client_number AS clientNumber,
            nif,
            document_type AS documentType,
            notes,
            file_path AS filePath,
            upload_at AS uploadAt,
            file_size AS fileSize,
            extension
          FROM documents
          WHERE id = ?`
        )
        .get(result.lastInsertRowid);

      return res.status(201).json(saved);
    } catch (error) {
      if (req.file?.path) {
        await fsp.unlink(req.file.path).catch(() => {});
      }
      return res.status(500).json({ error: 'Erro ao guardar documento.', detail: error.message });
    }
  });

  app.get('/api/documents', (req, res) => {
    const conditions = [];
    const params = {};

    const clientName = (req.query.clientName || '').toString().trim();
    const clientNumber = (req.query.clientNumber || '').toString().trim();
    const nif = (req.query.nif || '').toString().trim();
    const types = (req.query.types || '').toString().trim();
    const dateFrom = (req.query.dateFrom || '').toString().trim();
    const dateTo = (req.query.dateTo || '').toString().trim();
    const text = (req.query.text || '').toString().trim();

    if (clientName) {
      conditions.push('client_name LIKE @clientName');
      params.clientName = `%${clientName}%`;
    }
    if (clientNumber) {
      conditions.push('client_number LIKE @clientNumber');
      params.clientNumber = `%${clientNumber}%`;
    }
    if (nif) {
      conditions.push('nif LIKE @nif');
      params.nif = `%${nif}%`;
    }

    if (types) {
      const typeList = types
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      if (typeList.length) {
        const placeholders = typeList.map((_, i) => `@type${i}`).join(', ');
        typeList.forEach((value, i) => {
          params[`type${i}`] = value;
        });
        conditions.push(`document_type IN (${placeholders})`);
      }
    }

    if (dateFrom) {
      conditions.push('upload_at >= @dateFrom');
      params.dateFrom = toIsoDateRangeStart(dateFrom);
    }
    if (dateTo) {
      conditions.push('upload_at <= @dateTo');
      params.dateTo = toIsoDateRangeEnd(dateTo);
    }
    if (text) {
      conditions.push('(original_name LIKE @text OR notes LIKE @text)');
      params.text = `%${text}%`;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = db
      .prepare(
        `SELECT
          id,
          original_name AS fileName,
          client_name AS clientName,
          client_number AS clientNumber,
          nif,
          document_type AS documentType,
          notes,
          file_path AS filePath,
          upload_at AS uploadAt,
          file_size AS fileSize,
          extension
        FROM documents
        ${whereClause}
        ORDER BY upload_at DESC
        LIMIT 500`
      )
      .all(params);

    res.json(rows);
  });

  app.get('/api/documents/:id/view', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT original_name, file_path FROM documents WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ error: 'Documento não encontrado.' });
    }

    if (!fs.existsSync(row.file_path)) {
      return res.status(404).json({ error: 'Ficheiro físico não encontrado.' });
    }

    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.original_name)}"`);
    return res.sendFile(path.resolve(row.file_path));
  });

  app.post('/api/documents/:id/open', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT file_path FROM documents WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ error: 'Documento não encontrado.' });
    }

    try {
      openPath(row.file_path);
      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/documents/:id/open-folder', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT file_path FROM documents WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ error: 'Documento não encontrado.' });
    }

    try {
      openPath(path.dirname(row.file_path));
      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.locals.db = db;
  return app;
}

if (require.main === module) {
  const app = createApp({
    dbPath: process.env.DB_PATH,
    documentsRoot: process.env.DOCUMENTS_ROOT,
  });

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`FileMane disponível em http://localhost:${port}`);
  });
}

module.exports = { createApp };
