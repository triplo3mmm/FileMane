const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const request = require('supertest');
const { createApp } = require('../server');

function tempPath(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('upload, save entities and search documents by filters', async (t) => {
  const workDir = tempPath('filemane-test-');
  const dbPath = path.join(workDir, 'data', 'test.db');
  const documentsRoot = path.join(workDir, 'Documentos');
  const uploadTemp = path.join(workDir, 'temp');
  const app = createApp({ dbPath, documentsRoot, uploadTemp });

  t.after(async () => {
    app.locals.db.close();
    await fsp.rm(workDir, { recursive: true, force: true });
  });

  const filePath = path.join(workDir, 'fatura.pdf');
  await fsp.writeFile(filePath, 'conteudo de teste');

  const uploadResponse = await request(app)
    .post('/api/documents')
    .field('clientName', 'Cliente A')
    .field('clientNumber', '1001')
    .field('nif', '123456789')
    .field('documentType', 'Faturas')
    .field('notes', 'Abril 2026')
    .field('saveClient', 'true')
    .field('saveType', 'true')
    .attach('file', filePath);

  assert.equal(uploadResponse.status, 201);
  assert.equal(uploadResponse.body.clientName, 'Cliente A');

  const clientsResponse = await request(app).get('/api/clients?query=Cliente');
  assert.equal(clientsResponse.status, 200);
  assert.equal(clientsResponse.body.length, 1);

  const typesResponse = await request(app).get('/api/document-types?query=Fat');
  assert.equal(typesResponse.status, 200);
  assert.equal(typesResponse.body[0].name, 'Faturas');

  const searchResponse = await request(app)
    .get('/api/documents')
    .query({ clientName: 'Cliente', nif: '123', types: 'Faturas', text: 'Abril' });

  assert.equal(searchResponse.status, 200);
  assert.equal(searchResponse.body.length, 1);
  assert.equal(searchResponse.body[0].fileName, 'fatura.pdf');

  const viewResponse = await request(app).get(`/api/documents/${searchResponse.body[0].id}/view`);
  assert.equal(viewResponse.status, 200);
  assert.match(viewResponse.header['content-disposition'], /inline/);
});
