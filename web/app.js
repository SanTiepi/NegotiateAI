// NegotiateAI — Web App (SPA)
// Zero dependencies, vanilla JS

// ============================================================
// Router
// ============================================================

const views = {};
document.querySelectorAll('.view').forEach((el) => {
  views[el.id.replace('view-', '')] = el;
});

function navigate(viewName) {
  Object.values(views).forEach((v) => v.classList.remove('active'));
  if (views[viewName]) views[viewName].classList.add('active');
  document.querySelectorAll('.nav-link').forEach((l) => {
    l.classList.toggle('active', l.dataset.view === viewName);
  });
  if (viewName === 'dashboard') loadDashboard();
  if (viewName === 'setup') loadPresets();
  if (viewName === 'history') loadHistory();
}

// Wire all [data-view] buttons
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-view]');
  if (target) {
    e.preventDefault();
    navigate(target.dataset.view);
  }
});

// ============================================================
// API helpers
// ============================================================

async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body;
}

function post(path, data) {
  return api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// ============================================================
// DASHBOARD
// ============================================================

const DIMENSION_LABELS = {
  outcomeLeverage: { label: 'Leverage & Outcome', max: 25 },
  batnaDiscipline: { label: 'Discipline BATNA', max: 20 },
  emotionalRegulation: { label: 'Regulation emotionnelle', max: 25 },
  biasResistance: { label: 'Resistance aux biais', max: 15 },
  conversationalFlow: { label: 'Flow conversationnel', max: 15 },
};

const BELT_COLORS = {
  white: '#e2e8f0',
  yellow: '#facc15',
  green: '#22c55e',
  blue: '#3b82f6',
  black: '#a78bfa',
};

async function loadDashboard() {
  try {
    const stats = await api('/api/dashboard');
    const empty = stats.totalSessions === 0;

    document.getElementById('d-empty').classList.toggle('hidden', !empty);
    document.querySelector('.stats-grid').classList.toggle('hidden', empty);
    document.querySelectorAll('#view-dashboard .grid-2').forEach((el) => el.classList.toggle('hidden', empty));

    if (empty) return;

    document.getElementById('d-sessions').textContent = stats.totalSessions;
    document.getElementById('d-score').textContent = stats.averageScore;
    document.getElementById('d-streak').textContent = stats.currentStreak;
    document.getElementById('d-autonomy').textContent = stats.autonomy?.label || '—';

    // Belts
    const beltsEl = document.getElementById('d-belts');
    beltsEl.innerHTML = '';
    const beltDefs = stats.beltDefinitions || [];
    for (const def of beltDefs) {
      const status = stats.belts?.[def.color] || {};
      const earned = status.earned || false;
      const row = document.createElement('div');
      row.className = 'belt-row';
      row.innerHTML = `
        <div class="belt-dot ${earned ? 'earned' : ''}" data-color="${def.color}" style="color:${BELT_COLORS[def.color] || '#64748b'}"></div>
        <span class="belt-name">${def.name}</span>
        <span class="belt-progress">${status.qualifyingSessions || 0}/3</span>
      `;
      beltsEl.appendChild(row);
    }

    // Weaknesses
    const weakEl = document.getElementById('d-weaknesses');
    weakEl.innerHTML = '';
    const weakDims = stats.weakDimensions || [];
    if (weakDims.length === 0) {
      weakEl.innerHTML = '<p class="text-muted">Pas encore de donnees</p>';
    } else {
      for (const dim of weakDims) {
        const info = DIMENSION_LABELS[dim] || { label: dim };
        const item = document.createElement('div');
        item.className = 'weakness-item';
        item.textContent = info.label;
        weakEl.appendChild(item);
      }
    }

    // Autonomy gap
    document.getElementById('d-gap').textContent = stats.autonomy?.gap || '—';
  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

// ============================================================
// SETUP & PRESETS
// ============================================================

let presetsLoaded = false;
const DIFF_COLORS = { cooperative: 'var(--green)', neutral: 'var(--blue)', hostile: 'var(--amber)', manipulative: 'var(--red)' };

async function loadPresets() {
  if (presetsLoaded) return;
  try {
    const presets = await api('/api/scenarios');
    const grid = document.getElementById('presets');
    grid.innerHTML = '';

    const basics = presets.filter((p) => !p.category);
    const celebrities = presets.filter((p) => p.category === 'celebrity');
    const extremes = presets.filter((p) => p.category === 'extreme');

    function renderGroup(title, items) {
      if (items.length === 0) return;
      const heading = document.createElement('h3');
      heading.textContent = title;
      heading.style.cssText = 'grid-column:1/-1;margin-top:12px;color:var(--text-muted);font-size:.85rem;text-transform:uppercase;letter-spacing:.06em';
      grid.appendChild(heading);

      for (const p of items) {
        const card = document.createElement('div');
        card.className = 'preset-card slide-up';
        const diffColor = DIFF_COLORS[p.difficulty || p.brief?.difficulty] || 'var(--text-muted)';
        card.innerHTML = `
          <div class="preset-emoji">${p.emoji}</div>
          <div class="preset-name">${p.name}</div>
          <div class="preset-desc">${p.description}</div>
          ${p.difficulty ? `<div style="margin-top:8px"><span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:.75rem;font-weight:600;color:${diffColor};border:1px solid ${diffColor};opacity:.7">${p.difficulty}</span></div>` : ''}
        `;
        if (p.scenarioFile) {
          card.addEventListener('click', () => launchScenario(p.scenarioFile));
        } else if (p.brief) {
          card.addEventListener('click', () => fillForm(p.brief));
        }
        grid.appendChild(card);
      }
    }

    renderGroup('Situations classiques', basics);
    renderGroup('Personnalites celebres', celebrities);
    renderGroup('Scenarios extremes', extremes);

    presetsLoaded = true;
  } catch (err) {
    console.error('Presets load error:', err);
  }
}

let pendingScenarioFile = null;
let pendingBrief = null;

async function launchScenario(scenarioFile) {
  try {
    const briefing = await post('/api/briefing', { scenarioFile });
    pendingScenarioFile = scenarioFile;
    pendingBrief = null;
    showBriefing(briefing);
  } catch (err) {
    alert('Erreur: ' + err.message);
  }
}

function fillForm(brief) {
  const form = document.getElementById('setup-form');
  for (const [key, value] of Object.entries(brief)) {
    const input = form.querySelector(`[name="${key}"]`);
    if (input) {
      if (input.type === 'radio') {
        const radio = form.querySelector(`[name="${key}"][value="${value}"]`);
        if (radio) radio.checked = true;
      } else {
        input.value = value;
      }
    }
  }
  // Scroll to form
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const brief = {};
  for (const input of form.querySelectorAll('input:not([type=radio]), select')) {
    if (input.name && input.value) brief[input.name] = input.value;
  }
  const checkedRadio = form.querySelector('input[type=radio]:checked');
  if (checkedRadio) brief[checkedRadio.name] = checkedRadio.value;

  // Go through briefing for custom scenarios too
  try {
    const briefing = await post('/api/briefing', { brief });
    pendingScenarioFile = null;
    pendingBrief = brief;
    showBriefing(briefing);
    return;
  } catch (err) { /* fallback to direct start */ }

  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Chargement...';

  try {
    const session = await post('/api/session', { brief });
    startNegotiation(session);
  } catch (err) {
    alert('Erreur: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Lancer la session';
  }
});

// ============================================================
// NEGOTIATION
// ============================================================

let currentSessionId = null;
let currentBrief = null;

function startNegotiation(session) {
  currentSessionId = session.sessionId;
  navigate('negotiate');

  document.getElementById('n-adversary').textContent = session.adversary?.identity || '—';
  document.getElementById('n-act').textContent = 'Ouverture';
  document.getElementById('n-turn').textContent = `Tour 0/${session.state?.maxTurns || 12}`;
  document.getElementById('n-status').textContent = 'active';
  document.getElementById('n-coaching').textContent = 'Le coaching apparaitra apres votre premier message.';
  document.getElementById('n-signals').innerHTML = '<span class="text-muted">—</span>';

  // Reset messages
  const messagesEl = document.getElementById('n-messages');
  messagesEl.innerHTML = '';
  addMessage('adversary', `Bonjour, je suis ${session.adversary?.identity || 'votre interlocuteur'}. ${session.adversary?.style ? `(${session.adversary.style})` : ''} Ouvrons la discussion.`);

  // Reset gauges
  updateGauges({
    dealQuality: 50, leverage: 0, biasRisk: 50,
    dealProbability: 50, tension: 30, momentum: 0, momentumTrend: 'stable',
  });

  // Enable form
  document.getElementById('msg-input').disabled = false;
  document.getElementById('btn-send').disabled = false;
  document.getElementById('msg-input').focus();
}

function addMessage(role, text) {
  const messagesEl = document.getElementById('n-messages');
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Turn submit
document.getElementById('turn-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text || !currentSessionId) return;

  // Handle /quit
  if (text === '/quit') {
    addMessage('system', 'Session terminee par l\'utilisateur.');
    endSession(null);
    return;
  }

  addMessage('user', text);
  input.value = '';
  input.disabled = true;
  const sendBtn = document.getElementById('btn-send');
  sendBtn.disabled = true;
  sendBtn.classList.add('loading');

  // Show typing indicator
  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  spinner.textContent = 'Reflexion en cours...';
  spinner.id = 'typing-spinner';
  document.getElementById('n-messages').appendChild(spinner);
  spinner.scrollIntoView({ behavior: 'smooth' });

  try {
    const result = await post(`/api/session/${encodeURIComponent(currentSessionId)}/turn`, { message: text });

    // Remove spinner
    document.getElementById('typing-spinner')?.remove();
    sendBtn.classList.remove('loading');

    addMessage('adversary', result.adversaryResponse || '[silence]');

    // Update top bar
    document.getElementById('n-turn').textContent = `Tour ${result.state.turn}/${12}`;
    document.getElementById('n-status').textContent = result.state.status;

    // Act transition
    if (result.actTransition) {
      document.getElementById('n-act').textContent = result.actTransition.replace(/^[^\s]+\s/, '');
      addMessage('system', result.actTransition);
    }

    // Ticker
    if (result.ticker) updateGauges(result.ticker);

    // Coaching
    updateCoaching(result);

    // Signals
    updateSignals(result.detectedSignals);

    // Round scoring
    if (result.roundScore) updateRoundScore(result.roundScore);

    // Session over?
    if (result.sessionOver) {
      addMessage('system', `Session terminee: ${result.endReason || 'fin'}`);
      endSession(result.feedback, result.fightCard);
    } else {
      input.disabled = false;
      document.getElementById('btn-send').disabled = false;
      input.focus();
    }
  } catch (err) {
    document.getElementById('typing-spinner')?.remove();
    sendBtn.classList.remove('loading');
    addMessage('system', `Erreur: ${err.message}`);
    input.disabled = false;
    sendBtn.disabled = false;
  }
});

function endSession(feedback, fightCard) {
  currentSessionId = null;
  document.getElementById('msg-input').disabled = true;
  document.getElementById('btn-send').disabled = true;

  if (feedback || fightCard) {
    setTimeout(() => showResults(feedback, fightCard), 1500);
  }
}

// ============================================================
// GAUGES
// ============================================================

function updateGauges(ticker) {
  setGauge('g-deal', ticker.dealQuality, 100, `${ticker.dealQuality}%`, colorClass(ticker.dealQuality, false));
  setGaugeSigned('g-leverage', ticker.leverage, ticker.leverage > 0 ? `+${ticker.leverage}` : `${ticker.leverage}`);
  setGauge('g-bias', ticker.biasRisk, 100, `${ticker.biasRisk}%`, colorClass(ticker.biasRisk, true));
  setGauge('g-deal-prob', ticker.dealProbability, 100, `${ticker.dealProbability}%`, 'blue');
  setGauge('g-tension', ticker.tension, 100, `${ticker.tension}%`, 'amber');

  const momEl = document.getElementById('g-momentum');
  const momValue = momEl.querySelector('.gauge-value');
  const momFill = momEl.querySelector('.gauge-fill');
  const trend = ticker.momentumTrend || 'stable';
  const arrow = trend === 'gaining' ? ' \\u2191' : trend === 'losing' ? ' \\u2193' : ' \\u2192';
  momValue.textContent = `${trend}${arrow}`;
  momValue.className = `gauge-value trend-${trend}`;
  const momPct = Math.min(100, Math.max(0, 50 + (ticker.momentum || 0) / 2));
  momFill.style.width = `${momPct}%`;
  momFill.className = `gauge-fill ${trend === 'gaining' ? 'green' : trend === 'losing' ? 'red' : 'amber'}`;
}

function setGauge(id, value, max, display, cls) {
  const el = document.getElementById(id);
  el.querySelector('.gauge-value').textContent = display;
  const fill = el.querySelector('.gauge-fill');
  fill.style.width = `${Math.min(100, Math.max(0, (value / max) * 100))}%`;
  fill.className = `gauge-fill ${cls}`;
}

function setGaugeSigned(id, value, display) {
  const el = document.getElementById(id);
  el.querySelector('.gauge-value').textContent = display;
  const fill = el.querySelector('.gauge-fill-signed');
  const pct = Math.abs(value) / 2;
  if (value >= 0) {
    fill.style.left = '50%';
    fill.style.width = `${Math.min(50, pct)}%`;
    fill.style.background = 'linear-gradient(90deg, #16a34a, #22c55e)';
  } else {
    fill.style.width = `${Math.min(50, pct)}%`;
    fill.style.left = `${50 - Math.min(50, pct)}%`;
    fill.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
  }
}

function colorClass(value, invert) {
  if (invert) return value > 65 ? 'red' : value > 35 ? 'amber' : 'green';
  return value > 65 ? 'green' : value > 35 ? 'amber' : 'red';
}

// ============================================================
// COACHING & SIGNALS
// ============================================================

function updateCoaching(result) {
  const el = document.getElementById('n-coaching');
  const parts = [];

  if (result.coaching?.levels?.observer) {
    parts.push(result.coaching.levels.observer);
  }
  if (result.coaching?.levels?.suggest) {
    parts.push(`<span class="coaching-tip">${result.coaching.levels.suggest}</span>`);
  } else if (result.coaching?.tip) {
    parts.push(`<span class="coaching-tip">${result.coaching.tip}</span>`);
  }
  if (result.coaching?.biasDetected) {
    parts.push(`<span class="coaching-bias">Biais: ${result.coaching.biasDetected}</span>`);
  }

  el.innerHTML = parts.length > 0 ? parts.join('<br><br>') : 'Rien a signaler.';
}

function updateSignals(signals) {
  const el = document.getElementById('n-signals');
  if (!signals || signals.length === 0) {
    el.innerHTML = '<span class="text-muted">Aucun signal</span>';
    return;
  }
  el.innerHTML = signals.map((s) => `<span class="signal-tag">${typeof s === 'string' ? s : s.type || s.signal || JSON.stringify(s)}</span>`).join('');
}

// ============================================================
// SIMULATE BEFORE SEND
// ============================================================

document.getElementById('btn-simulate').addEventListener('click', async () => {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text || !currentSessionId) return;

  const modal = document.getElementById('simulate-modal');
  const body = document.getElementById('sim-body');
  modal.classList.remove('hidden');
  body.innerHTML = '<div class="loading"><div class="spinner">Simulation en cours — analyse de 3 scenarios...</div></div>';

  try {
    const report = await post(`/api/session/${encodeURIComponent(currentSessionId)}/simulate`, { message: text });
    renderSimulation(report);
  } catch (err) {
    body.innerHTML = `<p style="color:var(--red)">Erreur: ${err.message}</p>`;
  }
});

document.getElementById('sim-close').addEventListener('click', () => {
  document.getElementById('simulate-modal').classList.add('hidden');
});

function renderSimulation(report) {
  const body = document.getElementById('sim-body');
  const verdictLabel = { send: 'Envoyer', revise: 'A reviser', do_not_send: 'Ne pas envoyer' };

  body.innerHTML = `
    <div class="sim-verdict ${report.sendVerdict}">${verdictLabel[report.sendVerdict] || report.sendVerdict}</div>
    <div class="sim-score" style="color:${report.approvalScore > 65 ? 'var(--green)' : report.approvalScore > 40 ? 'var(--amber)' : 'var(--red)'}">${report.approvalScore}/100</div>
    <p style="text-align:center;color:var(--text-muted);margin-bottom:16px">${report.predictedOutcome}</p>

    <div class="sim-section">
      <h4>Reaction simulee de l'adversaire</h4>
      <p style="font-style:italic;color:var(--text-2);padding:8px 12px;background:var(--bg);border-radius:8px">"${report.simulatedResponse}"</p>
    </div>

    ${report.strengths?.length ? `<div class="sim-section"><h4>Points forts</h4><ul class="sim-list">${report.strengths.map((s) => `<li>${s}</li>`).join('')}</ul></div>` : ''}
    ${report.vulnerabilities?.length ? `<div class="sim-section"><h4>Vulnerabilites</h4><ul class="sim-list">${report.vulnerabilities.map((v) => `<li>${v}</li>`).join('')}</ul></div>` : ''}
    ${report.likelyObjections?.length ? `<div class="sim-section"><h4>Objections probables</h4><ul class="sim-list">${report.likelyObjections.map((o) => `<li>${o}</li>`).join('')}</ul></div>` : ''}
    ${report.recommendedRewrite ? `<div class="sim-section"><h4>Reformulation suggeree</h4><div class="sim-rewrite">${report.recommendedRewrite}</div></div>` : ''}

    <div style="text-align:center;margin-top:20px">
      <button class="btn btn-primary" onclick="document.getElementById('simulate-modal').classList.add('hidden')">Compris</button>
    </div>
  `;
}

// ============================================================
// BRIEFING
// ============================================================

function showBriefing(briefing) {
  navigate('briefing');

  // Context
  const ctx = document.getElementById('b-context');
  ctx.innerHTML = `
    ${briefing.situation ? `<p>${briefing.situation}</p>` : ''}
    <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
      ${briefing.playerRole ? `<span class="role-tag">Vous: ${briefing.playerRole}</span>` : ''}
      ${briefing.adversaryRole ? `<span class="role-tag">Face a: ${briefing.adversaryRole}</span>` : ''}
      ${briefing.difficulty ? `<span class="role-tag" style="background:${DIFF_COLORS[briefing.difficulty] || 'var(--text-muted)'}22;color:${DIFF_COLORS[briefing.difficulty] || 'var(--text-muted)'}">${briefing.difficulty}</span>` : ''}
    </div>
    ${briefing.adversaryPublic ? `<h3 style="margin-top:14px">Votre adversaire</h3><p>${briefing.adversaryPublic.identity || ''}</p><p class="text-muted">${briefing.adversaryPublic.style || ''}</p>` : ''}
    ${briefing.relationalStakes ? `<h3>Enjeux relationnels</h3><p class="text-muted">${briefing.relationalStakes}</p>` : ''}
    ${briefing.constraints?.length ? `<h3>Contraintes</h3><ul style="padding-left:18px">${briefing.constraints.map((c) => `<li class="text-muted">${c}</li>`).join('')}</ul>` : ''}
  `;

  // Odds
  const odds = briefing.odds || {};
  const oddsEl = document.getElementById('b-odds');
  oddsEl.textContent = `${odds.successRate || 50}%`;
  oddsEl.style.color = odds.successRate > 60 ? 'var(--green)' : odds.successRate > 40 ? 'var(--amber)' : 'var(--red)';
  oddsEl.style.background = odds.successRate > 60 ? 'var(--green-bg)' : odds.successRate > 40 ? 'var(--amber-bg)' : 'var(--red-bg)';
  document.getElementById('b-odds-msg').textContent = odds.message || '';

  // Pre-fill suggestions
  const form = document.getElementById('briefing-form');
  const suggestions = briefing.suggestions || {};
  const objField = form.querySelector('[name="objective"]');
  const threshField = form.querySelector('[name="threshold"]');
  const batnaField = form.querySelector('[name="batna"]');
  if (objField) objField.value = suggestions.objective || '';
  if (threshField) threshField.value = suggestions.minimalThreshold || '';
  if (batnaField) batnaField.value = suggestions.batna || '';
}

document.getElementById('briefing-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const objectiveContract = {
    objective: form.querySelector('[name="objective"]').value,
    threshold: form.querySelector('[name="threshold"]').value,
    batna: form.querySelector('[name="batna"]').value,
    relationalGoal: form.querySelector('[name="relationalGoal"]').value,
    strategy: form.querySelector('[name="strategy"]').value,
  };

  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Lancement...';

  try {
    const payload = { objectiveContract };
    if (pendingScenarioFile) payload.scenarioFile = pendingScenarioFile;
    else if (pendingBrief) payload.brief = pendingBrief;

    const session = await post('/api/session', payload);
    startNegotiation(session);
  } catch (err) {
    alert('Erreur: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Accepter le defi';
  }
});

// ============================================================
// ROUND SCORING
// ============================================================

function updateRoundScore(roundScore) {
  const ptsEl = document.getElementById('n-round-pts');
  const labelEl = document.getElementById('n-round-label');
  const cumulEl = document.getElementById('n-round-cumul');

  const sign = roundScore.points > 0 ? '+' : '';
  ptsEl.textContent = `${sign}${roundScore.points}`;
  ptsEl.className = `round-points ${roundScore.points > 0 ? 'positive' : roundScore.points < 0 ? 'negative' : 'neutral'}`;
  labelEl.textContent = roundScore.label;
  if (roundScore.signals?.length) labelEl.textContent += ` (${roundScore.signals.join(', ')})`;
  cumulEl.textContent = `Cumulatif: ${roundScore.cumulativeScore > 0 ? '+' : ''}${roundScore.cumulativeScore}`;
}

// ============================================================
// RESULTS
// ============================================================

function showResults(feedback, fightCard) {
  navigate('results');

  // Grade (from fight card) or fallback to score
  if (fightCard?.grade) {
    const g = fightCard.grade;
    const badgeEl = document.getElementById('r-grade-badge');
    badgeEl.textContent = g.grade;
    badgeEl.style.background = `${g.color}22`;
    badgeEl.style.color = g.color;
    badgeEl.style.border = `3px solid ${g.color}`;
    document.getElementById('r-grade-label').textContent = g.label;
    document.getElementById('r-grade-desc').textContent = g.description;
  } else {
    const score = feedback?.globalScore || 0;
    document.getElementById('r-grade-badge').textContent = score;
    document.getElementById('r-grade-label').textContent = 'Score';
    document.getElementById('r-grade-desc').textContent = '';
  }

  // Triangle
  if (fightCard?.triangle) {
    const t = fightCard.triangle;
    document.getElementById('r-tri-trans').style.width = `${t.transaction}%`;
    document.getElementById('r-tri-trans-v').textContent = t.transaction;
    document.getElementById('r-tri-rel').style.width = `${t.relation}%`;
    document.getElementById('r-tri-rel-v').textContent = t.relation;
    document.getElementById('r-tri-intel').style.width = `${t.intelligence}%`;
    document.getElementById('r-tri-intel-v').textContent = t.intelligence;
    if (t.totalHints > 0) {
      document.getElementById('r-discovery').textContent = `Objectif cache: ${t.hintsDiscovered}/${t.totalHints} indices decouverts`;
    }
  }

  // Rounds
  if (fightCard?.rounds) {
    const roundsEl = document.getElementById('r-rounds');
    roundsEl.innerHTML = '';
    for (const r of fightCard.rounds.detail) {
      const dot = document.createElement('div');
      dot.className = `round-dot ${r.points > 0 ? 'win' : r.points < 0 ? 'lose' : 'draw'}`;
      dot.textContent = r.points > 0 ? `+${r.points}` : r.points;
      dot.title = `Tour ${r.turn}: ${r.signals.join(', ') || 'neutre'}`;
      roundsEl.appendChild(dot);
    }
    const summary = document.createElement('span');
    summary.className = 'text-muted';
    summary.style.marginLeft = '8px';
    summary.textContent = `${fightCard.rounds.won}W ${fightCard.rounds.lost}L ${fightCard.rounds.neutral}D`;
    roundsEl.appendChild(summary);
  }

  const score = feedback?.globalScore || 0;

  // Dimensions
  const dimsEl = document.getElementById('r-dimensions');
  dimsEl.innerHTML = '';
  const scores = feedback.scores || {};
  for (const [key, info] of Object.entries(DIMENSION_LABELS)) {
    const val = scores[key] || 0;
    const pct = Math.round((val / info.max) * 100);
    const cls = pct >= 70 ? 'green' : pct >= 45 ? 'amber' : 'red';
    const row = document.createElement('div');
    row.className = 'dim-row';
    row.innerHTML = `
      <div class="dim-header"><span class="dim-name">${info.label}</span><span class="dim-score">${val}/${info.max}</span></div>
      <div class="dim-bar"><div class="dim-fill gauge-fill ${cls}" style="width:${pct}%"></div></div>
    `;
    dimsEl.appendChild(row);
  }

  // Biases
  const biasEl = document.getElementById('r-biases');
  biasEl.innerHTML = '';
  const biases = feedback.biasesDetected || [];
  if (biases.length === 0) {
    biasEl.innerHTML = '<p class="text-muted">Aucun biais detecte. Bravo !</p>';
  } else {
    for (const b of biases) {
      const card = document.createElement('div');
      card.className = 'bias-card';
      card.innerHTML = `<div class="bias-type">${b.biasType}</div>${b.explanation ? `<div class="bias-detail">${b.explanation}</div>` : ''}`;
      biasEl.appendChild(card);
    }
  }

  // Tactics
  const tacEl = document.getElementById('r-tactics');
  tacEl.innerHTML = '';
  const tactics = feedback.tacticsUsed || [];
  if (tactics.length === 0) {
    tacEl.innerHTML = '<p class="text-muted">Aucune tactique identifiee</p>';
  } else {
    for (const t of tactics) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = t;
      tacEl.appendChild(tag);
    }
  }

  // Recommendations
  const recEl = document.getElementById('r-recs');
  recEl.innerHTML = '';
  const recs = feedback.recommendations || [];
  for (const r of recs) {
    const li = document.createElement('li');
    li.textContent = r;
    recEl.appendChild(li);
  }
}

// ============================================================
// HISTORY
// ============================================================

async function loadHistory() {
  try {
    const sessions = await api('/api/sessions');
    const listEl = document.getElementById('h-list');
    const emptyEl = document.getElementById('h-empty');

    if (sessions.length === 0) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    listEl.innerHTML = '';

    for (const s of sessions) {
      const date = s.date ? new Date(s.date).toLocaleDateString('fr-CH', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
      const row = document.createElement('div');
      row.className = 'history-row slide-up';
      row.innerHTML = `
        <span class="history-date">${date}</span>
        <span class="history-situation">${s.situation}</span>
        <span class="history-diff ${s.difficulty}">${s.difficulty}</span>
        <span class="history-score" style="color:${s.score >= 65 ? 'var(--green)' : s.score >= 40 ? 'var(--amber)' : 'var(--red)'}">${s.score}</span>
        <span class="history-status ${s.status}">${s.status}</span>
      `;
      listEl.appendChild(row);
    }
  } catch (err) {
    console.error('History load error:', err);
  }
}

// ============================================================
// QUIT button
// ============================================================

document.getElementById('btn-quit').addEventListener('click', () => {
  if (currentSessionId && confirm('Quitter la session en cours ?')) {
    addMessage('system', 'Session abandonnee.');
    endSession(null);
    setTimeout(() => navigate('dashboard'), 1000);
  }
});

// ============================================================
// INIT
// ============================================================

loadDashboard();
