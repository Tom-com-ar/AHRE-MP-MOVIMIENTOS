const button = document.querySelector('#search');
const limitSelect = document.querySelector('#limit');
const message = document.querySelector('#message');
const rows = document.querySelector('#rows');
const count = document.querySelector('#count');
const title = document.querySelector('#result-title');
const pagination = document.querySelector('#pagination');
const previousButton = document.querySelector('#previous');
const nextButton = document.querySelector('#next');
const pageInfo = document.querySelector('#page-info');

const MAX_OFFSET = 10000;
let currentLimit = Number(limitSelect.value);
let currentOffset = 0;
let currentTotal = 0;
let busy = false;

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

function render(data) {
  rows.replaceChildren();
  const payments = Array.isArray(data.results) ? data.results : [];
  count.textContent = `${payments.length} en esta página · ${data.total ?? payments.length} encontrados`;
  title.textContent = payments.length ? 'Pagos encontrados' : 'La consulta respondió, sin pagos para mostrar';

  for (const payment of payments) {
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
  }
}

function updatePagination(data) {
  currentLimit = Number(data.limit) || currentLimit;
  currentOffset = Number(data.offset) || 0;
  currentTotal = Number(data.total) || 0;

  const pageCount = Math.max(1, Math.ceil(currentTotal / currentLimit));
  const pageNumber = Math.floor(currentOffset / currentLimit) + 1;
  pageInfo.textContent = `Página ${pageNumber} de ${pageCount}`;
  pagination.hidden = currentTotal <= currentLimit && currentOffset === 0;
  previousButton.disabled = busy || currentOffset === 0;
  nextButton.disabled = busy || currentOffset >= MAX_OFFSET || currentOffset + currentLimit >= currentTotal;
}

function setBusy(value) {
  busy = value;
  button.disabled = value;
  limitSelect.disabled = value;
  previousButton.disabled = value || currentOffset === 0;
  nextButton.disabled = value || currentOffset >= MAX_OFFSET || currentOffset + currentLimit >= currentTotal;
  button.innerHTML = value ? 'Consultando…' : 'Buscar pagos <span>→</span>';
}

async function searchAt(offset) {
  const requestedLimit = Number(limitSelect.value);
  setBusy(true);
  setMessage(`Consultando hasta ${requestedLimit} pagos desde la posición ${offset + 1}…`);

  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ limit: requestedLimit, offset }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || `La prueba respondió HTTP ${response.status}. Revisá la ejecución en n8n.`);
    }

    render(data);
    updatePagination(data);
    setMessage('Respuesta recibida. El tipo de movimiento conserva el valor original cuando no hay una categoría conocida.', 'success');
  } catch (error) {
    title.textContent = 'No se pudo completar la consulta';
    pagination.hidden = true;
    setMessage(error.message || 'Error de conexión con n8n.', 'error');
  } finally {
    setBusy(false);
    updatePagination({ limit: currentLimit, offset: currentOffset, total: currentTotal });
  }
}

button.addEventListener('click', () => searchAt(0));
previousButton.addEventListener('click', () => {
  if (currentOffset > 0) searchAt(Math.max(0, currentOffset - currentLimit));
});
nextButton.addEventListener('click', () => {
  const nextOffset = currentOffset + currentLimit;
  if (nextOffset <= MAX_OFFSET && nextOffset < currentTotal) searchAt(nextOffset);
});
limitSelect.addEventListener('change', () => {
  currentLimit = Number(limitSelect.value);
  currentOffset = 0;
  currentTotal = 0;
  pagination.hidden = true;
  setMessage(`Se consultarán hasta ${currentLimit} pagos por página.`);
});
