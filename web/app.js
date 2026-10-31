const button = document.querySelector('#search');
const limitSelect = document.querySelector('#limit');
const autoIntervalInput = document.querySelector('#auto-interval');
const autoUnitSelect = document.querySelector('#auto-unit');
const autoToggle = document.querySelector('#auto-toggle');
const autoStatus = document.querySelector('#auto-status');
const autoCountdown = document.querySelector('#auto-countdown');
const message = document.querySelector('#message');
const rows = document.querySelector('#rows');
const count = document.querySelector('#count');
const title = document.querySelector('#result-title');
const pagination = document.querySelector('#pagination');
const loadMoreButton = document.querySelector('#load-more');
const pageInfo = document.querySelector('#page-info');

const MAX_OFFSET = 10000;
const AUTO_MIN_INTERVAL_MS = 30 * 1000;
const AUTO_MAX_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTO_POLL_LIMIT = 50;
let currentLimit = Number(limitSelect.value);
let nextOffset = 0;
let currentTotal = 0;
let hasMore = false;
let busy = false;
let queryCompleted = false;
let autoEnabled = false;
let autoTimer = null;
let countdownTimer = null;
let nextPollAt = null;
let loadedPayments = [];
const loadedIds = new Set();

function setMessage(text, kind = '') {
  message.textContent = text;
  message.className = `message ${kind}`.trim();
}

function setAutoStatus(text, kind = '') {
  autoStatus.textContent = text;
  autoStatus.className = `auto-status ${kind}`.trim();
}

function formatCountdown(milliseconds) {
  const totalSeconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days) return `${days}d ${hours}h ${minutes}m`;
  if (hours) return `${hours}h ${minutes}m ${seconds}s`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateCountdown() {
  if (!autoEnabled || nextPollAt === null) return;
  autoCountdown.textContent = `Próxima consulta en ${formatCountdown(nextPollAt - Date.now())}`;
}

function scheduleNextPoll(intervalMs) {
  if (!autoEnabled) return;
  if (countdownTimer !== null) clearInterval(countdownTimer);
  if (autoTimer !== null) clearTimeout(autoTimer);

  nextPollAt = Date.now() + intervalMs;
  autoCountdown.hidden = false;
  updateCountdown();
  countdownTimer = setInterval(updateCountdown, 1000);
  autoTimer = setTimeout(async () => {
    autoTimer = null;
    if (countdownTimer !== null) clearInterval(countdownTimer);
    countdownTimer = null;
    nextPollAt = null;
    if (!autoEnabled) return;

    autoCountdown.textContent = 'Consultando ahora…';
    await pollForNewPayments();
    if (autoEnabled) scheduleNextPoll(intervalMs);
  }, intervalMs);
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

function fmtSignedMoney(value, currency, direction) {
  if (value === null || value === undefined) return '—';
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fmtMoney(value, currency);

  const amount = fmtMoney(Math.abs(numericValue), currency);
  if (direction === 'in') return `+${amount}`;
  if (direction === 'out') return `−${amount}`;
  return amount;
}

function addCell(row, value, className = '') {
  const cell = document.createElement('td');
  cell.textContent = value ?? '—';
  if (className) cell.className = className;
  row.appendChild(cell);
  return cell;
}

function createPaymentRow(payment) {
  const row = document.createElement('tr');
  addCell(row, payment.id, 'id');
  addCell(row, fmtDate(payment.date_created));

  const status = addCell(row, payment.status || '—', 'status');
  if (payment.status === 'approved') status.classList.add('approved');
  if (payment.status === 'rejected') status.classList.add('rejected');

  const amount = addCell(
    row,
    fmtSignedMoney(payment.transaction_amount, payment.currency_id, payment.amount_direction),
    'money',
  );
  if (payment.amount_direction === 'in') amount.classList.add('incoming');
  if (payment.amount_direction === 'out') amount.classList.add('outgoing');
  addCell(row, payment.movement_type || 'Sin dato');
  addCell(row, payment.counterpart_label || '—');
  addCell(row, payment.payment_method_normalized || 'Sin dato');
  return row;
}

function appendPayments(payments) {
  let added = 0;

  for (const payment of payments) {
    const id = payment.id === null || payment.id === undefined ? null : String(payment.id);
    if (id !== null && loadedIds.has(id)) continue;
    if (id !== null) loadedIds.add(id);

    rows.appendChild(createPaymentRow(payment));
    loadedPayments.push(payment);
    added += 1;
  }

  return added;
}

function prependNewPayments(payments) {
  const freshPayments = [];

  for (const payment of payments) {
    const id = payment.id === null || payment.id === undefined ? null : String(payment.id);
    if (id !== null && loadedIds.has(id)) continue;
    if (id !== null) loadedIds.add(id);
    freshPayments.push(payment);
  }

  for (let index = freshPayments.length - 1; index >= 0; index -= 1) {
    rows.prepend(createPaymentRow(freshPayments[index]));
  }
  loadedPayments = [...freshPayments, ...loadedPayments];
  return freshPayments.length;
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

async function requestPayments(limit, offset) {
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ limit, offset }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || `La prueba respondió HTTP ${response.status}. Revisá la ejecución en n8n.`);
  }
  return data;
}

async function searchAt(offset, reset = false) {
  currentLimit = Number(limitSelect.value);
  if (reset) {
    stopAutoPolling('Detenida. Podés volver a iniciarla después de la búsqueda.');
    clearResults();
  }

  setBusy(true);
  setMessage(`Consultando hasta ${currentLimit} pagos desde la posición ${offset + 1}…`);

  try {
    const data = await requestPayments(currentLimit, offset);
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

function selectedInterval() {
  const value = Number(autoIntervalInput.value);
  const multipliers = {
    seconds: 1000,
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
  };
  const milliseconds = value * multipliers[autoUnitSelect.value];

  if (!Number.isFinite(value) || value <= 0 || milliseconds < AUTO_MIN_INTERVAL_MS) {
    throw new Error('El intervalo mínimo para las pruebas es de 30 segundos.');
  }
  if (milliseconds > AUTO_MAX_INTERVAL_MS) {
    throw new Error('El intervalo máximo es de 30 días.');
  }
  return milliseconds;
}

function describeInterval() {
  const value = Number(autoIntervalInput.value);
  const unit = autoUnitSelect.value;
  const label = {
    seconds: value === 1 ? 'segundo' : 'segundos',
    minutes: value === 1 ? 'minuto' : 'minutos',
    hours: value === 1 ? 'hora' : 'horas',
    days: value === 1 ? 'día' : 'días',
  }[unit];
  return `cada ${value} ${label}`;
}

async function pollForNewPayments() {
  if (busy) {
    setAutoStatus('Se salteó una revisión porque otra consulta sigue en curso.');
    return;
  }

  setBusy(true);
  setMessage('Revisando los pagos más recientes…');

  try {
    const data = await requestPayments(AUTO_POLL_LIMIT, 0);
    const payments = Array.isArray(data.results) ? data.results : [];
    const added = prependNewPayments(payments);
    currentTotal = Number.isFinite(Number(data.total)) ? Number(data.total) : payments.length;
    nextOffset += added;
    hasMore = nextOffset < currentTotal && nextOffset <= MAX_OFFSET;
    queryCompleted = true;
    updatePagination();

    const checkedAt = new Date().toLocaleTimeString('es-AR');
    if (added) {
      setMessage(`Se agregaron ${added} pagos nuevos arriba de la lista.`, 'success');
      setAutoStatus(`Última revisión ${checkedAt}: ${added} novedad${added === 1 ? '' : 'es'}.`, 'success');
    } else {
      setMessage('Revisión automática completada; no aparecieron pagos nuevos.', 'success');
      setAutoStatus(`Última revisión ${checkedAt}: sin novedades.`);
    }
  } catch (error) {
    setMessage(error.message || 'Error de conexión con n8n.', 'error');
    setAutoStatus(`Falló la revisión: ${error.message || 'error de conexión'}.`, 'error');
  } finally {
    setBusy(false);
    updatePagination();
  }
}

function stopAutoPolling(status = 'Consulta automática detenida.') {
  if (autoTimer !== null) clearTimeout(autoTimer);
  if (countdownTimer !== null) clearInterval(countdownTimer);
  autoTimer = null;
  countdownTimer = null;
  nextPollAt = null;
  autoEnabled = false;
  autoToggle.textContent = 'Iniciar consulta automática';
  autoIntervalInput.disabled = false;
  autoUnitSelect.disabled = false;
  autoCountdown.hidden = true;
  autoCountdown.textContent = '';
  setAutoStatus(status);
}

async function startAutoPolling() {
  let intervalMs;
  try {
    intervalMs = selectedInterval();
  } catch (error) {
    setAutoStatus(error.message, 'error');
    return;
  }

  autoEnabled = true;
  autoToggle.textContent = 'Detener consulta automática';
  autoIntervalInput.disabled = true;
  autoUnitSelect.disabled = true;
  setAutoStatus(`Activa ${describeInterval()}. Dejá esta pestaña abierta.`);
  autoCountdown.hidden = false;
  autoCountdown.textContent = 'Consultando ahora…';
  await pollForNewPayments();
  if (autoEnabled) scheduleNextPoll(intervalMs);
}

button.addEventListener('click', () => searchAt(0, true));
loadMoreButton.addEventListener('click', () => {
  if (hasMore && nextOffset <= MAX_OFFSET) searchAt(nextOffset);
});
limitSelect.addEventListener('change', () => {
  stopAutoPolling('Detenida porque cambió la cantidad por tanda.');
  currentLimit = Number(limitSelect.value);
  clearResults();
  title.textContent = 'Todavía no hicimos la consulta';
  setMessage(`Se cargarán ${currentLimit} pagos por tanda. Iniciá una nueva búsqueda.`);
});
autoToggle.addEventListener('click', () => {
  if (autoEnabled) stopAutoPolling();
  else startAutoPolling();
});
