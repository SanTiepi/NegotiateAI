const setupForm = document.querySelector('#setup-form');
const turnForm = document.querySelector('#turn-form');
const chat = document.querySelector('#chat');
const statusEl = document.querySelector('#status');
const messagesEl = document.querySelector('#messages');
const messageInput = document.querySelector('#message-input');

let sessionId = null;

function addMessage(role, text) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
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
  statusEl.textContent = `Session ${sessionId} · adversaire: ${payload.adversary.identity}`;
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
  }
});
