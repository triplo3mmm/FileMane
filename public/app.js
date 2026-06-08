const state = {
  clients: [],
  types: [],
  typeSuggestions: [],
  searchTimer: null,
  searchTypeSelection: null,
};

const elements = {};

function bindElements() {
  [
    'statDocuments',
    'statClients',
    'statSize',
    'recentItems',
    'documentsRootLabel',
    'documentsRootInput',
    'settingsForm',
    'uploadForm',
    'clientName',
    'clientNumber',
    'nif',
    'documentType',
    'clientSuggestions',
    'typeSuggestions',
    'searchForm',
    'searchClientName',
    'searchClientSuggestions',
    'searchClientNumber',
    'searchNif',
    'searchDateFrom',
    'searchDateTo',
    'searchText',
    'searchTypes',
    'searchTypesAll',
    'clearSearch',
    'resultsBody',
    'clientForm',
    'newClientName',
    'newClientNumber',
    'newClientNif',
    'clientsItems',
    'typeForm',
    'newTypeName',
    'typesItems',
    'toast',
  ].forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function showToast(message, variant = 'info') {
  elements.toast.textContent = message;
  elements.toast.classList.toggle('error', variant === 'error');
  elements.toast.classList.remove('hidden');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.add('hidden'), 3200);
}

function showTab(tab) {
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.add('hidden'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error([body.error, body.detail].filter(Boolean).join(' ') || 'Falha no pedido.');
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function postJson(url, payload) {
  return requestJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function putJson(url, payload) {
  return requestJson(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('pt-PT') : '';
}

function formatBytes(value) {
  if (!value) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = Number(value);
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function appendTextCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = value || '';
  row.appendChild(cell);
  return cell;
}

function createButton(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function createIconButton(label, title, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn secondary icon-btn';
  button.textContent = label;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.addEventListener('click', onClick);
  return button;
}

function findClient(name) {
  const normalized = (name || '').trim().toLowerCase();
  return state.clients.find((client) => client.name.toLowerCase() === normalized);
}

function clientExists(name, number, nif) {
  return state.clients.some((client) => client.clientNumber === number || client.nif === nif);
}

function typeExists(name) {
  const normalized = (name || '').trim().toUpperCase();
  return state.types.some((type) => type.name.toUpperCase() === normalized);
}

function forceUppercase(control) {
  control.value = control.value.toUpperCase();
}

function fillClientDetails() {
  const client = findClient(elements.clientName.value);
  if (!client) {
    elements.clientNumber.value = '';
    elements.nif.value = '';
    return;
  }
  elements.clientNumber.value = client.clientNumber;
  elements.nif.value = client.nif;
}

function fillSearchClientDetails() {
  const client = findClient(elements.searchClientName.value);
  if (!client) {
    elements.searchClientNumber.value = '';
    elements.searchNif.value = '';
    return;
  }
  elements.searchClientNumber.value = client.clientNumber;
  elements.searchNif.value = client.nif;
}

function getSelectedSearchTypes() {
  return Array.from(elements.searchTypes.querySelectorAll('input[type="checkbox"]:checked')).map(
    (input) => input.value
  );
}

function setSelectedSearchTypes(values) {
  const selected = new Set(values);
  elements.searchTypes.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = selected.has(input.value);
  });
  state.searchTypeSelection = new Set(selected);
  elements.searchTypesAll.disabled = !state.types.length;
}

function renderClients() {
  elements.clientsItems.innerHTML = '';

  state.clients.forEach((client) => {
    const item = document.createElement('li');
    item.className = 'list-row';

    const content = document.createElement('span');
    content.textContent = `${client.name} | Nº ${client.clientNumber} | NIF ${client.nif}`;

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    actions.appendChild(
      createIconButton('x', 'Apagar cliente', () => {
        deleteClient(client).catch((error) => showToast(error.message, 'error'));
      })
    );

    item.append(content, actions);
    elements.clientsItems.appendChild(item);
  });

  if (!state.clients.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Ainda não existem clientes guardados.';
    elements.clientsItems.appendChild(empty);
  }
}

function renderTypes() {
  const previousSelection = state.searchTypeSelection;
  const selected = previousSelection ? new Set(previousSelection) : new Set(state.types.map((type) => type.name));
  elements.typesItems.innerHTML = '';
  elements.searchTypes.innerHTML = '';

  if (state.types.length) {
    elements.searchTypesAll.disabled = false;
  }

  state.types.forEach((type) => {
    const item = document.createElement('li');
    item.className = 'list-row';

    const content = document.createElement('span');
    content.textContent = type.name;

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    actions.appendChild(
      createIconButton('x', 'Apagar tipo', () => {
        deleteType(type).catch((error) => showToast(error.message, 'error'));
      })
    );

    item.append(content, actions);
    elements.typesItems.appendChild(item);

    const label = document.createElement('label');
    label.className = 'search-type-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = type.name;
    checkbox.checked = selected.has(type.name);

    const text = document.createElement('span');
    text.textContent = type.name;

    label.append(checkbox, text);
    elements.searchTypes.appendChild(label);
  });

  state.searchTypeSelection = new Set(getSelectedSearchTypes());

  if (!state.types.length) {
    elements.searchTypesAll.disabled = true;
  }

  if (!state.types.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Ainda não existem tipos de documento guardados.';
    elements.typesItems.appendChild(empty);
  }
}

function renderClientSuggestions(rows, query = '') {
  elements.clientSuggestions.innerHTML = '';

  if (!rows.length && query.trim()) {
    const empty = document.createElement('div');
    empty.className = 'suggestion empty';
    empty.textContent = 'Cliente não encontrado';
    elements.clientSuggestions.appendChild(empty);
    elements.clientSuggestions.classList.remove('hidden');
    return;
  }

  rows.forEach((client) => {
    const button = document.createElement('button');
    const title = document.createElement('strong');
    button.type = 'button';
    button.className = 'suggestion';
    button.setAttribute('role', 'option');
    title.textContent = `${client.name} | ${client.clientNumber} | ${client.nif}`;
    button.appendChild(title);
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      selectClient(client);
    });
    elements.clientSuggestions.appendChild(button);
  });

  elements.clientSuggestions.classList.toggle('hidden', !rows.length);
}

function renderSearchClientSuggestions(rows, query = '') {
  elements.searchClientSuggestions.innerHTML = '';

  if (!rows.length && query.trim()) {
    const empty = document.createElement('div');
    empty.className = 'suggestion empty';
    empty.textContent = 'Cliente não encontrado';
    elements.searchClientSuggestions.appendChild(empty);
    elements.searchClientSuggestions.classList.remove('hidden');
    return;
  }

  rows.forEach((client) => {
    const button = document.createElement('button');
    const title = document.createElement('strong');
    button.type = 'button';
    button.className = 'suggestion';
    button.setAttribute('role', 'option');
    title.textContent = `${client.name} | ${client.clientNumber} | ${client.nif}`;
    button.appendChild(title);
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      selectSearchClient(client);
    });
    elements.searchClientSuggestions.appendChild(button);
  });

  elements.searchClientSuggestions.classList.toggle('hidden', !rows.length);
}

function renderTypeSuggestions(rows, query = '') {
  elements.typeSuggestions.innerHTML = '';
  state.typeSuggestions = rows;

  if (!rows.length && query.trim()) {
    const empty = document.createElement('div');
    empty.className = 'suggestion empty';
    empty.textContent = 'Tipo não encontrado';
    elements.typeSuggestions.appendChild(empty);
    elements.typeSuggestions.classList.remove('hidden');
    return;
  }

  rows.forEach((type) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion';
    button.setAttribute('role', 'option');
    button.textContent = type.name;
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      selectType(type);
    });
    elements.typeSuggestions.appendChild(button);
  });

  elements.typeSuggestions.classList.toggle('hidden', !rows.length);
}

function selectClient(client) {
  elements.clientName.value = client.name;
  elements.clientNumber.value = client.clientNumber;
  elements.nif.value = client.nif;
  elements.clientSuggestions.classList.add('hidden');
}

function selectSearchClient(client) {
  elements.searchClientName.value = client.name;
  elements.searchClientNumber.value = client.clientNumber;
  elements.searchNif.value = client.nif;
  elements.searchClientSuggestions.classList.add('hidden');
  queueSearch();
}

function selectType(type) {
  elements.documentType.value = type.name;
  elements.typeSuggestions.classList.add('hidden');
}

async function deleteClient(client) {
  if (!window.confirm(`Apagar o cliente ${client.name}?`)) {
    return;
  }

  await requestJson(`/api/clients/${client.id}`, { method: 'DELETE' });
  await Promise.all([refreshClients(), refreshDashboard(), runSearch()]);
  showToast('Cliente apagado.');
}

async function deleteType(type) {
  if (!window.confirm(`Apagar o tipo ${type.name}?`)) {
    return;
  }

  await requestJson(`/api/document-types/${type.id}`, { method: 'DELETE' });
  await Promise.all([refreshTypes(), refreshDashboard(), runSearch()]);
  showToast('Tipo apagado.');
}

function renderRecent(rows) {
  elements.recentItems.innerHTML = '';
  if (!rows.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Ainda não foram adicionados documentos.';
    elements.recentItems.appendChild(empty);
    return;
  }

  rows.forEach((row) => {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    const meta = document.createElement('p');
    title.textContent = row.fileName;
    meta.className = 'muted';
    meta.textContent = `${row.clientName} | ${row.documentType} | ${formatDate(row.uploadAt)}`;
    item.append(title, meta);
    elements.recentItems.appendChild(item);
  });
}

async function refreshSettings() {
  const settings = await requestJson('/api/settings');
  elements.documentsRootLabel.textContent = settings.documentsRoot;
  elements.documentsRootLabel.title = settings.documentsRoot;
  elements.documentsRootInput.value = settings.documentsRoot;
}

async function refreshDashboard() {
  const stats = await requestJson('/api/dashboard');
  elements.statDocuments.textContent = stats.totalDocuments;
  elements.statClients.textContent = stats.totalClients;
  elements.statSize.textContent = formatBytes(stats.totalSize);
  renderRecent(stats.recentDocuments || []);
}

async function refreshClients(query = '') {
  const suffix = query ? `?query=${encodeURIComponent(query)}&limit=100` : '?limit=100';
  state.clients = await requestJson(`/api/clients${suffix}`);
  renderClients();
}

async function refreshTypes(query = '') {
  const suffix = query ? `?query=${encodeURIComponent(query)}&limit=100` : '?limit=100';
  state.types = await requestJson(`/api/document-types${suffix}`);
  renderTypes();
}

async function fetchClientSuggestions(query = '') {
  const suffix = query ? `?query=${encodeURIComponent(query)}&limit=50` : '?limit=50';
  const rows = await requestJson(`/api/clients${suffix}`);
  renderClientSuggestions(rows, query);
}

async function fetchSearchClientSuggestions(query = '') {
  const suffix = query ? `?query=${encodeURIComponent(query)}&limit=50` : '?limit=50';
  const rows = await requestJson(`/api/clients${suffix}`);
  renderSearchClientSuggestions(rows, query);
}

async function fetchTypeSuggestions(query = '') {
  const suffix = query ? `?query=${encodeURIComponent(query)}&limit=50` : '?limit=50';
  const rows = await requestJson(`/api/document-types${suffix}`);
  renderTypeSuggestions(rows, query);
}

async function openDocument(row) {
  if (row.extension === '.pdf') {
    window.open(`/api/documents/${row.id}/view`, '_blank', 'noopener,noreferrer');
    return;
  }

  await requestJson(`/api/documents/${row.id}/open`, { method: 'POST' });
  showToast('Pedido enviado ao sistema operativo.');
}

async function openFolder(row) {
  await requestJson(`/api/documents/${row.id}/open-folder`, { method: 'POST' });
  showToast('Pedido enviado ao Explorador de Ficheiros.');
}

function renderResults(rows) {
  elements.resultsBody.innerHTML = '';

  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'empty';
    td.colSpan = 7;
    td.textContent = 'Sem documentos para os filtros selecionados.';
    tr.appendChild(td);
    elements.resultsBody.appendChild(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    appendTextCell(tr, row.fileName);
    appendTextCell(tr, row.clientName);
    appendTextCell(tr, row.nif);
    appendTextCell(tr, row.documentType);
    appendTextCell(tr, formatDate(row.uploadAt));

    const openCell = document.createElement('td');
    openCell.appendChild(
      createButton(row.extension === '.pdf' ? 'Ver PDF' : 'Abrir', 'btn blue', () => {
        openDocument(row).catch((error) => showToast(error.message, 'error'));
      })
    );
    tr.appendChild(openCell);

    const folderCell = document.createElement('td');
    folderCell.appendChild(
      createButton('Abrir pasta', 'btn secondary', () => {
        openFolder(row).catch((error) => showToast(error.message, 'error'));
      })
    );
    tr.appendChild(folderCell);
    elements.resultsBody.appendChild(tr);
  });
}

async function runSearch(event) {
  if (event) event.preventDefault();

  const selectedTypes = getSelectedSearchTypes();
  const params = new URLSearchParams({
    clientName: elements.searchClientName.value,
    clientNumber: elements.searchClientNumber.value,
    nif: elements.searchNif.value,
    dateFrom: elements.searchDateFrom.value,
    dateTo: elements.searchDateTo.value,
    text: elements.searchText.value,
  });

  if (selectedTypes.length && selectedTypes.length < state.types.length) {
    params.set('types', selectedTypes.join(','));
  }

  const rows = await requestJson(`/api/documents?${params.toString()}`);
  renderResults(rows);
}

function queueSearch() {
  window.clearTimeout(state.searchTimer);
  state.searchTimer = window.setTimeout(() => {
    runSearch().catch((error) => showToast(error.message, 'error'));
  }, 220);
}

async function onUploadSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const clientName = elements.clientName.value.trim();
  const clientNumber = elements.clientNumber.value.trim();
  const nif = elements.nif.value.trim();
  const documentType = elements.documentType.value.trim();

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
    throw new Error([body.error, body.detail].filter(Boolean).join(' ') || 'Erro no upload.');
  }

  form.reset();
  elements.clientSuggestions.classList.add('hidden');
  await Promise.all([refreshClients(), refreshTypes(), refreshDashboard(), runSearch()]);
  showTab('search');
  showToast('Documento guardado.');
}

function bindNavigation() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });

  document.querySelectorAll('[data-tab-target]').forEach((btn) => {
    btn.addEventListener('click', () => showTab(btn.dataset.tabTarget));
  });
}

function bindForms() {
  elements.settingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await putJson('/api/settings', { documentsRoot: elements.documentsRootInput.value.trim() });
      await refreshSettings();
      showToast('Pasta de documentos atualizada.');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  elements.uploadForm.addEventListener('submit', (event) => {
    onUploadSubmit(event).catch((error) => showToast(error.message, 'error'));
  });

  elements.clientForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = elements.newClientName.value.trim();
    const clientNumber = elements.newClientNumber.value.trim();
    const nif = elements.newClientNif.value.trim();

    if (clientExists(name, clientNumber, nif)) {
      showToast('Já existe um cliente com esse número e/ou NIF.', 'error');
      return;
    }

    try {
      await postJson('/api/clients', {
        name,
        clientNumber,
        nif,
      });
      form.reset();
      await Promise.all([refreshClients(), refreshDashboard()]);
      showToast('Cliente guardado.');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  elements.typeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = elements.newTypeName.value.trim().toUpperCase();

    if (!name) {
      showToast('Nome do tipo é obrigatório.', 'error');
      return;
    }

    try {
      await postJson('/api/document-types', {
        name,
      });
      form.reset();
      await Promise.all([refreshTypes(), refreshDashboard()]);
      showToast('Tipo guardado.');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  elements.searchForm.addEventListener('submit', (event) => {
    runSearch(event).catch((error) => showToast(error.message, 'error'));
  });

  elements.clearSearch.addEventListener('click', () => {
    elements.searchForm.reset();
    state.searchTypeSelection = null;
    renderTypes();
    elements.searchClientSuggestions.classList.add('hidden');
    runSearch().catch((error) => showToast(error.message, 'error'));
  });
}

function bindAutocomplete() {
  elements.clientName.addEventListener('input', (event) => {
    fetchClientSuggestions(event.target.value).then(fillClientDetails).catch(() => {});
  });
  elements.clientName.addEventListener('focus', (event) => {
    fetchClientSuggestions(event.target.value).catch(() => {});
  });
  elements.clientName.addEventListener('change', fillClientDetails);
  elements.clientName.addEventListener('blur', () => {
    fillClientDetails();
    window.setTimeout(() => elements.clientSuggestions.classList.add('hidden'), 120);
  });

  elements.searchClientName.addEventListener('input', (event) => {
    fetchSearchClientSuggestions(event.target.value).then(fillSearchClientDetails).then(queueSearch).catch(() => {});
  });
  elements.searchClientName.addEventListener('focus', (event) => {
    fetchSearchClientSuggestions(event.target.value).catch(() => {});
  });
  elements.searchClientName.addEventListener('change', () => {
    fillSearchClientDetails();
    queueSearch();
  });
  elements.searchClientName.addEventListener('blur', () => {
    fillSearchClientDetails();
    window.setTimeout(() => elements.searchClientSuggestions.classList.add('hidden'), 120);
  });

  elements.documentType.addEventListener('input', (event) => {
    forceUppercase(event.target);
    fetchTypeSuggestions(event.target.value).catch(() => {});
  });
  elements.documentType.addEventListener('focus', (event) => {
    fetchTypeSuggestions(event.target.value).catch(() => {});
  });
  elements.documentType.addEventListener('change', (event) => {
    forceUppercase(event.target);
  });
  elements.documentType.addEventListener('blur', () => {
    window.setTimeout(() => elements.typeSuggestions.classList.add('hidden'), 120);
  });

  elements.newTypeName.addEventListener('input', (event) => {
    forceUppercase(event.target);
  });
  elements.newTypeName.addEventListener('change', (event) => {
    forceUppercase(event.target);
  });

  [
    elements.searchClientNumber,
    elements.searchNif,
    elements.searchDateFrom,
    elements.searchDateTo,
    elements.searchText,
  ].forEach((control) => {
    control.addEventListener('input', queueSearch);
    control.addEventListener('change', queueSearch);
  });

  elements.searchTypes.addEventListener('change', () => {
    setSelectedSearchTypes(getSelectedSearchTypes());
    queueSearch();
  });

  elements.searchTypesAll.addEventListener('click', () => {
    setSelectedSearchTypes(state.types.map((type) => type.name));
    queueSearch();
  });
}

async function init() {
  bindElements();
  bindNavigation();
  bindForms();
  bindAutocomplete();
  await Promise.all([refreshSettings(), refreshDashboard(), refreshClients(), refreshTypes()]);
  await runSearch();
}

init().catch((error) => {
  console.error(error);
  bindElements();
  showToast('Falha ao iniciar aplicação.', 'error');
});
