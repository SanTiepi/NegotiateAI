const setupForm = document.querySelector('#setup-form');
const turnForm = document.querySelector('#turn-form');
const chat = document.querySelector('#chat');
const statusEl = document.querySelector('#status');
const messagesEl = document.querySelector('#messages');
const messageInput = document.querySelector('#message-input');
const metaEl = document.querySelector('#meta');
const tickerEl = document.querySelector('#ticker');
const coachEl = document.querySelector('#coach');

let sessionId = null;

function addMessage(role, text) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderTicker(ticker) {
  if (!ticker) {
    tickerEl.textContent = 'Ticker indisponible.';
    return;
  }

  tickerEl.textContent = [
    `Deal ${ticker.dealQuality}%`,
    `Leverage ${ticker.leverage > 0 ? '+' : ''}${ticker.leverage}`,
    `Bias risk ${ticker.biasRisk}%`,
    `Deal prob ${ticker.dealProbability}%`,
    `Tension ${ticker.tension}%`,
    `Momentum ${ticker.momentumTrend} (${ticker.momentum > 0 ? '+' : ''}${ticker.momentum})`,
  ].join('\n');
}

function renderCoaching(payload) {
  const parts = [];
  if (payload.actTransition) parts.push(`Acte: ${payload.actTransition}`);
  if (payload.coaching?.levels?.observer) parts.push(`Observer: ${payload.coaching.levels.observer}`);
  if (payload.coaching?.levels?.suggest) parts.push(`Suggest: ${payload.coaching.levels.suggest}`);
  else if (payload.coaching?.tip) parts.push(`Tip: ${payload.coaching.tip}`);
  if (payload.sessionOver) parts.push(`Fin: ${payload.endReason || 'session terminée'}`);

  coachEl.textContent = parts.join('\n\n') || 'Coaching en attente.';
}

setupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(setupForm);
  const brief = Object.fromEntries(data.entries());

  const response = await fetch('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ brief }),
  });
  const payload = await response.json();
  if (!response.ok) {
    statusEl.textContent = payload.error || 'Erreur de démarrage';
    return;
  }

  sessionId = payload.sessionId;
  chat.classList.remove('hidden');
  metaEl.classList.remove('hidden');
  statusEl.textContent = `Session ${sessionId} · adversaire: ${payload.adversary.identity}`;
  tickerEl.textContent = 'Le ticker apparaîtra après le premier tour.';
  coachEl.textContent = 'Le coaching temps réel apparaîtra ici.';
  addMessage('adversary', `Bonjour, je suis ${payload.adversary.identity}. Ouvrons la discussion.`);
});

turnForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !sessionId) return;

  addMessage('user', text);
  messageInput.value = '';

  const response = await fetch(`/api/session/${encodeURIComponent(sessionId)}/turn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: text }),
  });
  const payload = await response.json();
  if (!response.ok) {
    statusEl.textContent = payload.error || 'Erreur de tour';
    return;
  }

  addMessage('adversary', payload.adversaryResponse || '[silence]');
  statusEl.textContent = `Tour ${payload.state.turn} · statut: ${payload.state.status}`;
  if (payload.sessionOver) {
    statusEl.textContent += ` · fin: ${payload.endReason || 'session terminée'}`;
    sessionId = null;
  }

  renderTicker(payload.ticker);
  renderCoaching(payload);
});
