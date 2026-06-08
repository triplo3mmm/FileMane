const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const { createApp } = require('../server');

function tempPath(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function listen(app) {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${server.address().port}`,
      });
    });
  });
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function json(response) {
  return response.json();
}

test('upload, save entities and search documents by filters', async (t) => {
  const workDir = tempPath('filemane-test-');
  const dbPath = path.join(workDir, 'data', 'test.db');
  const documentsRoot = path.join(workDir, 'Documentos');
  const uploadTemp = path.join(workDir, 'temp');
  const app = createApp({ dbPath, documentsRoot, uploadTemp });
  const { server, baseUrl } = await listen(app);

  t.after(async () => {
    await close(server);
    app.locals.db.close();
    await fsp.rm(workDir, { recursive: true, force: true });
  });

  const filePath = path.join(workDir, 'fatura.pdf');
  await fsp.writeFile(filePath, 'conteudo de teste');

  const settingsResponse = await fetch(`${baseUrl}/api/settings`);
  assert.equal(settingsResponse.status, 200);
  assert.equal((await json(settingsResponse)).documentsRoot, documentsRoot);

  const form = new FormData();
  form.set('clientName', 'Cliente A');
  form.set('clientNumber', '1001');
  form.set('nif', '123456789');
  form.set('documentType', 'Faturas');
  form.set('documentMonth', '2026-04');
  form.set('notes', 'Abril 2026');
  form.set('saveClient', 'true');
  form.set('saveType', 'true');
  form.set('file', new Blob([await fsp.readFile(filePath)], { type: 'application/pdf' }), 'fatura.pdf');

  const uploadResponse = await fetch(`${baseUrl}/api/documents`, {
    method: 'POST',
    body: form,
  });

  assert.equal(uploadResponse.status, 201);
  const uploadBody = await json(uploadResponse);
  assert.equal(uploadBody.clientName, 'Cliente A');
  assert.equal(uploadBody.documentType, 'FATURAS');
  assert.equal(uploadBody.documentDateLabel, '04/2026');
  assert.equal(uploadBody.documentDatePrecision, 'month');

  const clientToDeleteResponse = await fetch(`${baseUrl}/api/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Cliente Z',
      clientNumber: '9090',
      nif: '909090909',
    }),
  });
  assert.equal(clientToDeleteResponse.status, 201);
  const clientToDelete = await json(clientToDeleteResponse);

  const deleteClientResponse = await fetch(`${baseUrl}/api/clients/${clientToDelete.id}`, {
    method: 'DELETE',
  });
  assert.equal(deleteClientResponse.status, 200);
  assert.equal((await json(deleteClientResponse)).message, 'Cliente apagado.');

  const typeToDeleteResponse = await fetch(`${baseUrl}/api/document-types`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Recibos' }),
  });
  assert.equal(typeToDeleteResponse.status, 201);
  const typeToDelete = await json(typeToDeleteResponse);
  assert.equal(typeToDelete.name, 'RECIBOS');

  const deleteTypeResponse = await fetch(`${baseUrl}/api/document-types/${typeToDelete.id}`, {
    method: 'DELETE',
  });
  assert.equal(deleteTypeResponse.status, 200);
  assert.equal((await json(deleteTypeResponse)).message, 'Tipo apagado.');

  const duplicateClientResponse = await fetch(`${baseUrl}/api/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Cliente B',
      clientNumber: '1001',
      nif: '999999999',
    }),
  });
  assert.equal(duplicateClientResponse.status, 409);

  const duplicateNifResponse = await fetch(`${baseUrl}/api/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Cliente C',
      clientNumber: '2002',
      nif: '123456789',
    }),
  });
  assert.equal(duplicateNifResponse.status, 409);

  const clientsResponse = await fetch(`${baseUrl}/api/clients?query=Cliente`);
  assert.equal(clientsResponse.status, 200);
  assert.equal((await json(clientsResponse)).length, 1);

  const clientsByNumberResponse = await fetch(`${baseUrl}/api/clients?query=1001`);
  assert.equal(clientsByNumberResponse.status, 200);
  assert.equal((await json(clientsByNumberResponse))[0].name, 'Cliente A');

  const clientsByNifResponse = await fetch(`${baseUrl}/api/clients?query=456`);
  assert.equal(clientsByNifResponse.status, 200);
  assert.equal((await json(clientsByNifResponse))[0].nif, '123456789');

  const typesResponse = await fetch(`${baseUrl}/api/document-types?query=fat`);
  assert.equal(typesResponse.status, 200);
  assert.equal((await json(typesResponse))[0].name, 'FATURAS');

  const params = new URLSearchParams({
    clientName: 'Cliente',
    nif: '123',
    types: 'FATURAS',
    dateFromMonth: '2026-04',
    dateToMonth: '2026-04',
    text: 'Abril',
  });
  const searchResponse = await fetch(`${baseUrl}/api/documents?${params.toString()}`);

  assert.equal(searchResponse.status, 200);
  const searchRows = await json(searchResponse);
  assert.equal(searchRows.length, 1);
  assert.equal(searchRows[0].fileName, 'fatura.pdf');
  assert.equal(searchRows[0].documentDateLabel, '04/2026');

  const viewResponse = await fetch(`${baseUrl}/api/documents/${searchRows[0].id}/view`);
  assert.equal(viewResponse.status, 200);
  assert.match(viewResponse.headers.get('content-disposition'), /inline/);
});

test('documents root can be configured locally', async (t) => {
  const workDir = tempPath('filemane-settings-');
  const dbPath = path.join(workDir, 'data', 'test.db');
  const documentsRoot = path.join(workDir, 'Documentos');
  const uploadTemp = path.join(workDir, 'temp');
  const app = createApp({ dbPath, documentsRoot, uploadTemp });
  const { server, baseUrl } = await listen(app);

  t.after(async () => {
    await close(server);
    app.locals.db.close();
    await fsp.rm(workDir, { recursive: true, force: true });
  });

  const nextRoot = path.join(workDir, 'Arquivo');
  const updateResponse = await fetch(`${baseUrl}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentsRoot: nextRoot }),
  });
  assert.equal(updateResponse.status, 200);
  assert.equal((await json(updateResponse)).documentsRoot, nextRoot);
  assert.equal(fs.existsSync(nextRoot), true);

  const settingsResponse = await fetch(`${baseUrl}/api/settings`);
  assert.equal((await json(settingsResponse)).documentsRoot, nextRoot);
});
