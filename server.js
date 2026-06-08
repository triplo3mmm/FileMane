const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const { rateLimit } = require('express-rate-limit');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function sanitizeSegment(value) {
  return (value || 'SemNome')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80) || 'SemNome';
}

function sanitizeFileName(value) {
  const sanitized = (value || 'ficheiro')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9-_. ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120);

  return sanitized && sanitized !== '.' && sanitized !== '..' ? sanitized : 'ficheiro';
}

function toIsoDateRangeStart(date) {
  return `${date}T00:00:00.000Z`;
}

function toIsoDateRangeEnd(date) {
  return `${date}T23:59:59.999Z`;
}

function parseLimit(value, fallback = 50, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

function normalizeDocumentType(value) {
  return (value || '').toString().trim().toUpperCase();
}

function findClientConflict(db, clientNumber, nif) {
  return db
    .prepare(
      `SELECT id, name, client_number AS clientNumber, nif
       FROM clients
       WHERE client_number = ? OR nif = ?
       LIMIT 1`
    )
    .get(clientNumber, nif);
}

function upsertDocumentType(db, name) {
  const existing = db
    .prepare('SELECT id, name FROM document_types WHERE name = ? COLLATE NOCASE LIMIT 1')
    .get(name);

  if (existing) {
    if (existing.name !== name) {
      db.prepare('UPDATE document_types SET name = ? WHERE id = ?').run(name, existing.id);
    }
    return { id: existing.id, name };
  }

  const result = db.prepare('INSERT INTO document_types(name) VALUES (?)').run(name);
  return { id: result.lastInsertRowid, name };
}

function ensurePathExists(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function resolveInside(rootPath, ...segments) {
  segments.forEach((segment) => {
    if (typeof segment !== 'string' || !segment.length) {
      throw new Error('Segmento de caminho inválido');
    }
    if (segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\')) {
      throw new Error('Segmento de caminho inválido');
    }
  });

  const root = path.resolve(rootPath);
  const resolved = path.resolve(root, ...segments);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('Caminho inválido');
  }
  return resolved;
}

function isInside(rootPath, targetPath) {
  const root = path.resolve(rootPath);
  const resolved = path.resolve(targetPath);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

async function removeTempFile(filePath, uploadRoot) {
  if (!filePath || !isInside(uploadRoot, filePath)) {
    return;
  }
  const safePath = resolveInside(uploadRoot, path.basename(filePath));
  if (path.resolve(filePath) !== safePath) {
    return;
  }
  await fsp.unlink(safePath).catch(() => {});
}

async function moveUploadedFile(sourcePath, finalPath) {
  try {
    await fsp.rename(sourcePath, finalPath);
  } catch (error) {
    if (error.code !== 'EXDEV') {
      throw error;
    }
    await fsp.copyFile(sourcePath, finalPath);
    await fsp.unlink(sourcePath);
  }
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

function openFolderForFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('Ficheiro físico não encontrado');
  }

  if (process.platform === 'win32') {
    const child = spawn('explorer.exe', [`/select,${filePath}`], { detached: true, stdio: 'ignore' });
    child.unref();
    return;
  }

  openPath(path.dirname(filePath));
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

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_upload_at ON documents(upload_at);
    CREATE INDEX IF NOT EXISTS idx_documents_client_name ON documents(client_name);
    CREATE INDEX IF NOT EXISTS idx_documents_nif ON documents(nif);
    CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);
    CREATE INDEX IF NOT EXISTS idx_clients_name_nocase ON clients(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_clients_number_nocase ON clients(client_number COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_clients_nif_nocase ON clients(nif COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_document_types_name_nocase ON document_types(name COLLATE NOCASE);
  `);

  return db;
}

function createApp(config = {}) {
  const app = express();
  const dbPath = config.dbPath || path.join(__dirname, 'data', 'filemane.db');
  const uploadTemp = config.uploadTemp || path.join(os.tmpdir(), 'filemane_uploads');

  fs.mkdirSync(uploadTemp, { recursive: true });

  const db = createDatabase(dbPath);
  const upload = multer({ dest: uploadTemp });
  const defaultDocumentsRoot = path.join(__dirname, 'Documentos');
  let documentsRoot =
    config.documentsRoot ||
    db.prepare('SELECT value FROM settings WHERE key = ?').get('documentsRoot')?.value ||
    defaultDocumentsRoot;

  function setDocumentsRoot(value) {
    if (!value || typeof value !== 'string') {
      throw new Error('Pasta de documentos inválida.');
    }

    const resolved = path.resolve(value);
    fs.mkdirSync(resolved, { recursive: true });
    db.prepare(
      `INSERT INTO settings(key, value)
       VALUES ('documentsRoot', @value)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run({ value: resolved });
    documentsRoot = resolved;
    return documentsRoot;
  }

  setDocumentsRoot(documentsRoot);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/dashboard', (_req, res) => {
    const stats = {
      totalDocuments: db.prepare('SELECT COUNT(*) AS count FROM documents').get().count,
      totalClients: db.prepare('SELECT COUNT(*) AS count FROM clients').get().count,
      totalTypes: db.prepare('SELECT COUNT(*) AS count FROM document_types').get().count,
      totalSize: db.prepare('SELECT COALESCE(SUM(file_size), 0) AS size FROM documents').get().size,
      recentDocuments: db
        .prepare(
          `SELECT id, original_name AS fileName, client_name AS clientName, UPPER(document_type) AS documentType, upload_at AS uploadAt
           FROM documents
           ORDER BY upload_at DESC
           LIMIT 5`
        )
        .all(),
    };
    res.json(stats);
  });

  app.get('/api/settings', (_req, res) => {
    res.json({
      documentsRoot,
      dbPath: path.resolve(dbPath),
      localMode: true,
    });
  });

  app.put('/api/settings', (req, res) => {
    try {
      const nextRoot = (req.body.documentsRoot || '').toString().trim();
      const savedRoot = setDocumentsRoot(nextRoot);
      res.json({ documentsRoot: savedRoot });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/clients', (req, res) => {
    const query = (req.query.query || '').toString().trim();
    const limit = parseLimit(req.query.limit);
    const stmt = query
      ? db.prepare(`
          SELECT id, name, client_number AS clientNumber, nif
          FROM clients
          WHERE name LIKE @contains OR client_number LIKE @contains OR nif LIKE @contains
          ORDER BY
            CASE
              WHEN name LIKE @prefix THEN 0
              WHEN client_number LIKE @prefix THEN 1
              WHEN nif LIKE @prefix THEN 2
              ELSE 3
            END,
            name COLLATE NOCASE
          LIMIT @limit
        `)
      : db.prepare(`
          SELECT id, name, client_number AS clientNumber, nif
          FROM clients
          ORDER BY name COLLATE NOCASE
          LIMIT @limit
        `);

    const rows = query
      ? stmt.all({ contains: `%${query}%`, prefix: `${query}%`, limit })
      : stmt.all({ limit });
    res.json(rows);
  });

  app.post('/api/clients', (req, res) => {
    const name = (req.body.name || '').toString().trim();
    const clientNumber = (req.body.clientNumber || '').toString().trim();
    const nif = (req.body.nif || '').toString().trim();

    if (!name || !clientNumber || !nif) {
      return res.status(400).json({ error: 'Nome, número de cliente e NIF são obrigatórios.' });
    }

    const conflict = findClientConflict(db, clientNumber, nif);
    if (conflict) {
      return res.status(409).json({ error: 'Já existe um cliente com esse número e/ou NIF.' });
    }

    const result = db
      .prepare('INSERT INTO clients(name, client_number, nif) VALUES (?, ?, ?)')
      .run(name, clientNumber, nif);

    const saved = db
      .prepare('SELECT id, name, client_number AS clientNumber, nif FROM clients WHERE id = ?')
      .get(result.lastInsertRowid);

    return res.status(201).json(saved);
  });

  app.delete('/api/clients/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Cliente inválido.' });
    }

    const result = db.prepare('DELETE FROM clients WHERE id = ?').run(id);
    if (!result.changes) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    return res.json({ message: 'Cliente apagado.' });
  });

  app.get('/api/document-types', (req, res) => {
    const query = (req.query.query || '').toString().trim();
    const limit = parseLimit(req.query.limit);
    const stmt = query
      ? db.prepare(`
          SELECT id, UPPER(name) AS name
          FROM document_types
          WHERE UPPER(name) LIKE @contains
          ORDER BY
            CASE WHEN UPPER(name) LIKE @prefix THEN 0 ELSE 1 END,
            UPPER(name) COLLATE NOCASE
          LIMIT @limit
        `)
      : db.prepare(`
          SELECT id, UPPER(name) AS name
          FROM document_types
          ORDER BY UPPER(name) COLLATE NOCASE
          LIMIT @limit
        `);

    const rows = query
      ? stmt.all({ contains: `%${query.toUpperCase()}%`, prefix: `${query.toUpperCase()}%`, limit })
      : stmt.all({ limit });
    res.json(rows);
  });

  app.post('/api/document-types', (req, res) => {
    const name = normalizeDocumentType(req.body.name);
    if (!name) {
      return res.status(400).json({ error: 'Nome do tipo é obrigatório.' });
    }

    const saved = upsertDocumentType(db, name);
    return res.status(201).json(saved);
  });

  app.delete('/api/document-types/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Tipo inválido.' });
    }

    const result = db.prepare('DELETE FROM document_types WHERE id = ?').run(id);
    if (!result.changes) {
      return res.status(404).json({ error: 'Tipo não encontrado.' });
    }

    return res.json({ message: 'Tipo apagado.' });
  });

  app.post('/api/documents', upload.single('file'), async (req, res) => {
    let finalDirToPrune = null;
    try {
      const file = req.file;
      const clientName = (req.body.clientName || '').toString().trim();
      const clientNumber = (req.body.clientNumber || '').toString().trim();
      const nif = (req.body.nif || '').toString().trim();
      const documentType = normalizeDocumentType(req.body.documentType);
      const notes = (req.body.notes || '').toString().trim();
      const saveClient = req.body.saveClient === 'true' || req.body.saveClient === true;
      const saveType = req.body.saveType === 'true' || req.body.saveType === true;

      if (!file) {
        return res.status(400).json({ error: 'Ficheiro é obrigatório.' });
      }
      if (!clientName || !clientNumber || !nif || !documentType) {
        await removeTempFile(file.path, uploadTemp);
        return res.status(400).json({ error: 'Cliente, número, NIF e tipo de documento são obrigatórios.' });
      }

      if (saveClient) {
        const conflict = findClientConflict(db, clientNumber, nif);
        if (conflict) {
          await removeTempFile(file.path, uploadTemp);
          return res.status(409).json({ error: 'Já existe um cliente com esse número e/ou NIF.' });
        }

        db.prepare('INSERT INTO clients(name, client_number, nif) VALUES (?, ?, ?)').run(clientName, clientNumber, nif);
      }
      if (saveType) {
        upsertDocumentType(db, documentType);
      }

      const customerFolder = sanitizeSegment(clientName);
      const typeFolder = sanitizeSegment(documentType);
      const finalDir = resolveInside(documentsRoot, customerFolder, typeFolder);
      await fsp.mkdir(finalDir, { recursive: true });
      finalDirToPrune = finalDir;

      const sanitizedOriginal = sanitizeFileName(path.basename(file.originalname));
      const storedFileName = `${Date.now()}-${sanitizedOriginal}`;
      const finalPath = resolveInside(finalDir, storedFileName);
      const tempPath = resolveInside(uploadTemp, path.basename(file.path));

      if (path.resolve(file.path) !== tempPath) {
        throw new Error('Caminho temporário inválido');
      }

      await moveUploadedFile(tempPath, finalPath);
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
            UPPER(document_type) AS documentType,
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
        await removeTempFile(req.file.path, uploadTemp);
      }
      if (finalDirToPrune) {
        await fsp.rmdir(finalDirToPrune).catch(() => {});
        await fsp.rmdir(path.dirname(finalDirToPrune)).catch(() => {});
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
        .map((value) => normalizeDocumentType(value))
        .filter(Boolean);

      if (typeList.length) {
        const placeholders = typeList.map((_, i) => `@type${i}`).join(', ');
        typeList.forEach((value, i) => {
          params[`type${i}`] = value;
        });
        conditions.push(`UPPER(document_type) IN (${placeholders})`);
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
          UPPER(document_type) AS documentType,
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
    if (!isInside(documentsRoot, row.file_path)) {
      return res.status(400).json({ error: 'Caminho inválido.' });
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
    if (!isInside(documentsRoot, row.file_path)) {
      return res.status(400).json({ error: 'Caminho inválido.' });
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
    if (!isInside(documentsRoot, row.file_path)) {
      return res.status(400).json({ error: 'Caminho inválido.' });
    }

    try {
      openFolderForFile(row.file_path);
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
