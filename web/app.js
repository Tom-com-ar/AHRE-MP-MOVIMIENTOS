const button = document.querySelector('#search');
const limitSelect = document.querySelector('#limit');
const message = document.querySelector('#message');
const rows = document.querySelector('#rows');
const count = document.querySelector('#count');
const title = document.querySelector('#result-title');
const pagination = document.querySelector('#pagination');
const loadMoreButton = document.querySelector('#load-more');
const pageInfo = document.querySelector('#page-info');

const MAX_OFFSET = 10000;
let currentLimit = Number(limitSelect.value);
let nextOffset = 0;
let currentTotal = 0;
let hasMore = false;
let busy = false;
let queryCompleted = false;
let loadedPayments = [];
const loadedIds = new Set();

function setMessage(text, kind = '') {
  message.textContent = text;
  message.className = `message ${kind}`.trim();
}

function fmtDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-AR');
}

function fmtMoney(value, currency) {
  if (value === null || value === undefined) return '—';
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: currency || 'ARS',
    }).format(value);
  } catch {
    return `${value} ${currency || ''}`.trim();
  }
}

function addCell(row, value, className = '') {
  const cell = document.createElement('td');
  cell.textContent = value ?? '—';
  if (className) cell.className = className;
  row.appendChild(cell);
  return cell;
}

function appendPayments(payments) {
  let added = 0;

  for (const payment of payments) {
    const id = payment.id === null || payment.id === undefined ? null : String(payment.id);
    if (id !== null && loadedIds.has(id)) continue;
    if (id !== null) loadedIds.add(id);

    const row = document.createElement('tr');
    addCell(row, payment.id, 'id');
    addCell(row, fmtDate(payment.date_created));

    const status = addCell(row, payment.status || '—', 'status');
    if (payment.status === 'approved') status.classList.add('approved');
    if (payment.status === 'rejected') status.classList.add('rejected');

    addCell(row, fmtMoney(payment.transaction_amount, payment.currency_id), 'money');
    addCell(row, payment.movement_type || 'Sin dato');
    addCell(row, payment.payment_method_normalized || 'Sin dato');
    rows.appendChild(row);
    loadedPayments.push(payment);
    added += 1;
  }

  return added;
}

function clearResults() {
  rows.replaceChildren();
  loadedPayments = [];
  loadedIds.clear();
  nextOffset = 0;
  currentTotal = 0;
  hasMore = false;
  queryCompleted = false;
  count.textContent = '—';
  title.textContent = 'Buscando pagos…';
  pagination.hidden = true;
}

function updatePagination() {
  if (loadedPayments.length) {
    count.textContent = `${loadedPayments.length} cargados · ${currentTotal} encontrados`;
  } else if (queryCompleted) {
    count.textContent = `${currentTotal} encontrados`;
  } else {
    count.textContent = '—';
  }
  if (loadedPayments.length) title.textContent = 'Pagos encontrados';
  else if (queryCompleted) title.textContent = 'La consulta respondió, sin pagos para mostrar';

  const remaining = Math.max(0, currentTotal - nextOffset);
  pageInfo.textContent = `${loadedPayments.length} de ${currentTotal} cargados`;
  loadMoreButton.textContent = `Cargar ${Math.min(currentLimit, remaining)} más`;
  pagination.hidden = !hasMore;
  loadMoreButton.disabled = busy || !hasMore;
}

function setBusy(value) {
  busy = value;
  button.disabled = value;
  limitSelect.disabled = value;
  loadMoreButton.disabled = value || !hasMore;
  button.innerHTML = value ? 'Consultando…' : 'Buscar pagos <span>→</span>';
}

async function searchAt(offset, reset = false) {
  currentLimit = Number(limitSelect.value);
  if (reset) clearResults();

  setBusy(true);
  setMessage(`Consultando hasta ${currentLimit} pagos desde la posición ${offset + 1}…`);

  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ limit: currentLimit, offset }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || `La prueba respondió HTTP ${response.status}. Revisá la ejecución en n8n.`);
    }

    const payments = Array.isArray(data.results) ? data.results : [];
    const responseOffset = Number.isFinite(Number(data.offset)) ? Number(data.offset) : offset;
    currentTotal = Number.isFinite(Number(data.total)) ? Number(data.total) : responseOffset + payments.length;
    appendPayments(payments);
    nextOffset = responseOffset + payments.length;
    hasMore = payments.length > 0 && nextOffset < currentTotal && nextOffset <= MAX_OFFSET;
    queryCompleted = true;
    updatePagination();

    if (payments.length) {
      setMessage(`Se agregaron ${payments.length} pagos. Los anteriores siguen en la lista.`, 'success');
    } else {
      setMessage('La consulta respondió, sin pagos para mostrar.', 'success');
    }
  } catch (error) {
    if (reset) title.textContent = 'No se pudo completar la consulta';
    setMessage(error.message || 'Error de conexión con n8n.', 'error');
  } finally {
    setBusy(false);
    updatePagination();
  }
}

button.addEventListener('click', () => searchAt(0, true));
loadMoreButton.addEventListener('click', () => {
  if (hasMore && nextOffset <= MAX_OFFSET) searchAt(nextOffset);
});
limitSelect.addEventListener('change', () => {
  currentLimit = Number(limitSelect.value);
  clearResults();
  title.textContent = 'Todavía no hicimos la consulta';
  setMessage(`Se cargarán ${currentLimit} pagos por tanda. Iniciá una nueva búsqueda.`);
});
