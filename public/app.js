const state = {
  clients: [],
  types: [],
};

function showTab(tab) {
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.add('hidden'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('bg-indigo-600', active);
    btn.classList.toggle('text-white', active);
    btn.classList.toggle('bg-white', !active);
  });
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Falha no pedido');
  return response.json();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Falha no pedido');
  }
  return response.json();
}

function renderClients() {
  const list = document.getElementById('clientsItems');
  const datalist = document.getElementById('clientsList');
  list.innerHTML = '';
  datalist.innerHTML = '';
  state.clients.forEach((client) => {
    const li = document.createElement('li');
    li.textContent = `${client.name} | Nº ${client.clientNumber} | NIF ${client.nif}`;
    list.appendChild(li);

    const option = document.createElement('option');
    option.value = client.name;
    datalist.appendChild(option);
  });
}

function renderTypes() {
  const list = document.getElementById('typesItems');
  const datalist = document.getElementById('typesList');
  const searchTypes = document.getElementById('searchTypes');
  list.innerHTML = '';
  datalist.innerHTML = '';
  searchTypes.innerHTML = '';

  state.types.forEach((type) => {
    const li = document.createElement('li');
    li.textContent = type.name;
    list.appendChild(li);

    const optionAuto = document.createElement('option');
    optionAuto.value = type.name;
    datalist.appendChild(optionAuto);

    const optionSelect = document.createElement('option');
    optionSelect.value = type.name;
    optionSelect.textContent = type.name;
    searchTypes.appendChild(optionSelect);
  });
}

function formatDate(value) {
  return new Date(value).toLocaleString('pt-PT');
}

async function refreshDashboard() {
  const stats = await getJson('/api/dashboard');
  document.getElementById('statDocuments').textContent = stats.totalDocuments;
  document.getElementById('statClients').textContent = stats.totalClients;
  document.getElementById('statTypes').textContent = stats.totalTypes;
}

async function refreshClients(query = '') {
  state.clients = await getJson(`/api/clients${query ? `?query=${encodeURIComponent(query)}` : ''}`);
  renderClients();
}

async function refreshTypes(query = '') {
  state.types = await getJson(`/api/document-types${query ? `?query=${encodeURIComponent(query)}` : ''}`);
  renderTypes();
}

async function runSearch(event) {
  if (event) event.preventDefault();
  const selectedTypes = Array.from(document.getElementById('searchTypes').selectedOptions).map((o) => o.value);
  const params = new URLSearchParams({
    clientName: document.getElementById('searchClientName').value,
    clientNumber: document.getElementById('searchClientNumber').value,
    nif: document.getElementById('searchNif').value,
    dateFrom: document.getElementById('searchDateFrom').value,
    dateTo: document.getElementById('searchDateTo').value,
    text: document.getElementById('searchText').value,
    types: selectedTypes.join(','),
  });

  const rows = await getJson(`/api/documents?${params.toString()}`);
  const tbody = document.getElementById('resultsBody');
  tbody.innerHTML = '';

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b';

    const openLabel = row.extension === '.pdf' ? 'Ver PDF' : 'Abrir ficheiro';
    tr.innerHTML = `
      <td class="p-2">${row.fileName}</td>
      <td class="p-2">${row.clientName}</td>
      <td class="p-2">${row.nif}</td>
      <td class="p-2">${row.documentType}</td>
      <td class="p-2">${formatDate(row.uploadAt)}</td>
      <td class="p-2"><button data-open="${row.id}" class="rounded bg-slate-800 px-2 py-1 text-white">${openLabel}</button></td>
      <td class="p-2"><button data-folder="${row.id}" class="rounded bg-slate-600 px-2 py-1 text-white">Abrir pasta</button></td>
    `;

    tr.querySelector('[data-open]').addEventListener('click', async () => {
      if (row.extension === '.pdf') {
        window.open(`/api/documents/${row.id}/view`, '_blank', 'noopener,noreferrer');
        return;
      }
      await fetch(`/api/documents/${row.id}/open`, { method: 'POST' });
    });

    tr.querySelector('[data-folder]').addEventListener('click', async () => {
      await fetch(`/api/documents/${row.id}/open-folder`, { method: 'POST' });
    });

    tbody.appendChild(tr);
  });
}

function clientExists(name, number, nif) {
  return state.clients.some(
    (client) =>
      client.name.toLowerCase() === name.toLowerCase() ||
      client.clientNumber === number ||
      client.nif === nif
  );
}

function typeExists(name) {
  return state.types.some((type) => type.name.toLowerCase() === name.toLowerCase());
}

async function onUploadSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const clientName = document.getElementById('clientName').value.trim();
  const clientNumber = document.getElementById('clientNumber').value.trim();
  const nif = document.getElementById('nif').value.trim();
  const documentType = document.getElementById('documentType').value.trim();

  const shouldSaveClient = !clientExists(clientName, clientNumber, nif)
    ? window.confirm('Deseja adicionar este cliente à base de dados?')
    : false;
  const shouldSaveType = !typeExists(documentType)
    ? window.confirm('Deseja guardar este tipo para utilização futura?')
    : false;

  const payload = new FormData(form);
  payload.set('saveClient', String(shouldSaveClient));
  payload.set('saveType', String(shouldSaveType));

  const response = await fetch('/api/documents', { method: 'POST', body: payload });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    alert(body.error || 'Erro no upload');
    return;
  }

  form.reset();
  await Promise.all([refreshClients(), refreshTypes(), refreshDashboard(), runSearch()]);
  showTab('search');
}

async function init() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });

  document.getElementById('uploadForm').addEventListener('submit', onUploadSubmit);
  document.getElementById('searchForm').addEventListener('submit', runSearch);

  document.getElementById('clientForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    await postJson('/api/clients', {
      name: document.getElementById('newClientName').value.trim(),
      clientNumber: document.getElementById('newClientNumber').value.trim(),
      nif: document.getElementById('newClientNif').value.trim(),
    });
    event.currentTarget.reset();
    await Promise.all([refreshClients(), refreshDashboard()]);
  });

  document.getElementById('typeForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    await postJson('/api/document-types', {
      name: document.getElementById('newTypeName').value.trim(),
    });
    event.currentTarget.reset();
    await Promise.all([refreshTypes(), refreshDashboard()]);
  });

  document.getElementById('clientName').addEventListener('input', (event) => {
    refreshClients(event.target.value).catch(() => {});
  });
  document.getElementById('documentType').addEventListener('input', (event) => {
    refreshTypes(event.target.value).catch(() => {});
  });

  await Promise.all([refreshDashboard(), refreshClients(), refreshTypes(), runSearch()]);
}

init().catch((error) => {
  console.error(error);
  alert('Falha ao iniciar aplicação.');
});
