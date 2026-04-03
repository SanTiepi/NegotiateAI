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
  if (viewName === 'academy') loadAcademy();
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

function getPlayerId() {
  const storageKey = 'negotiateai.playerId';
  try {
    let playerId = window.localStorage.getItem(storageKey);
    if (!playerId) {
      playerId = `web-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(storageKey, playerId);
    }
    return playerId;
  } catch {
    return 'local-player';
  }
}

function getDashboardFilters() {
  const form = document.getElementById('dashboard-filters');
  if (!form) {
    return {
      mode: '',
      difficulty: '',
      scenarioId: '',
    };
  }

  return {
    mode: form.querySelector('[name="mode"]')?.value || '',
    difficulty: form.querySelector('[name="difficulty"]')?.value || '',
    scenarioId: form.querySelector('[name="scenarioId"]')?.value || '',
  };
}

function withPlayerQuery(path, extraParams = {}) {
  const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(path, base);
  url.searchParams.set('playerId', getPlayerId());

  for (const [key, value] of Object.entries(extraParams)) {
    if (value) url.searchParams.set(key, value);
  }

  return `${url.pathname}${url.search}`;
}

function withPlayerPayload(data = {}) {
  return {
    ...data,
    playerId: getPlayerId(),
  };
}

// ============================================================
// DASHBOARD
// ============================================================

const DIMENSION_LABELS = {
  outcomeLeverage: { label: 'Levier & résultat', max: 25 },
  batnaDiscipline: { label: 'Discipline BATNA', max: 20 },
  emotionalRegulation: { label: 'Régulation émotionnelle', max: 25 },
  biasResistance: { label: 'Résistance aux biais', max: 15 },
  conversationalFlow: { label: 'Flow conversationnel', max: 15 },
};

const BELT_COLORS = {
  white: '#e2e8f0',
  yellow: '#facc15',
  green: '#22c55e',
  blue: '#3b82f6',
  black: '#a78bfa',
};

const DIFFICULTY_LABELS = {
  cooperative: 'Coopératif',
  neutral: 'Neutre',
  hostile: 'Hostile',
  manipulative: 'Manipulateur',
};

const MODE_LABELS = {
  web: 'Web',
  telegram: 'Telegram',
  cli: 'CLI',
  daily: 'Daily',
  drill: 'Drill',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderMetricList(elementId, entries, labelKey, valueFormatter) {
  const root = document.getElementById(elementId);
  root.innerHTML = '';
  if (!entries || entries.length === 0) {
    root.innerHTML = '<p class="text-muted">Pas encore de données</p>';
    return;
  }

  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'metric-row';
    row.innerHTML = `
      <span class="metric-label">${entry[labelKey]}</span>
      <span class="metric-value">${valueFormatter(entry)}</span>
    `;
    root.appendChild(row);
  }
}

// ============================================================
// ACADEMY
// ============================================================

let academyLoaded = false;
let academyDaily = null;
let academyWeekly = null;
let pendingSessionMeta = null;

function renderAcademyPlaceholder(elementId, text) {
  const root = document.getElementById(elementId);
  root.innerHTML = `<p class="text-muted">${escapeHtml(text)}</p>`;
}

function renderSkillPill(skill) {
  return `<span class="chip">${escapeHtml(skill)}</span>`;
}

async function loadAcademy(force = false) {
  if (academyLoaded && !force) return;

  try {
    const [profile, drills, weekly, hall] = await Promise.all([
      api(withPlayerQuery('/api/profile')),
      api('/api/drills'),
      api('/api/scenario-of-week'),
      api('/api/hall-of-fame?limit=3'),
    ]);

    academyWeekly = weekly || null;

    const profileEl = document.getElementById('academy-profile');
    const card = profile.card || {};
    profileEl.innerHTML = `
      <div class="academy-hero">
        <div>
          <div class="hero-kicker">Autonomie</div>
          <div class="hero-value">${escapeHtml(card.autonomy?.label || 'Niveau —')}</div>
        </div>
        <div>
          <div class="hero-kicker">Sessions</div>
          <div class="hero-value">${escapeHtml(card.totalSessions ?? 0)}</div>
        </div>
      </div>
      <div class="metric-row"><span class="metric-label">Ceinture actuelle</span><span class="metric-value">${escapeHtml(card.currentBelt?.name || 'Blanche')}</span></div>
      <div class="metric-row"><span class="metric-label">Exercice recommandé</span><span class="metric-value">${escapeHtml(profile.recommendedDrillId || 'mirror')}</span></div>
      <div class="metric-row"><span class="metric-label">Biais prioritaire</span><span class="metric-value">${escapeHtml(profile.biasRecommendation?.biasType || 'Aucun')}</span></div>
      <details class="academy-details">
        <summary>Version partageable</summary>
        <pre class="academy-pre">${escapeHtml(profile.shareable || 'Pas encore de carte partageable.')}</pre>
      </details>
    `;

    const drillsEl = document.getElementById('academy-drills');
    drillsEl.innerHTML = '';
    for (const drill of drills.drills || []) {
      const item = document.createElement('div');
      item.className = `academy-item ${drill.recommended ? 'recommended' : ''}`;
      item.innerHTML = `
        <div class="academy-item-head">
          <strong>${escapeHtml(drill.name)}</strong>
          ${drill.recommended ? '<span class="badge badge-success">Recommandé</span>' : ''}
        </div>
        <p class="text-muted">${escapeHtml(drill.description)}</p>
        <div class="academy-meta">
          ${renderSkillPill(drill.skill)}
          <span class="chip">${escapeHtml(drill.maxTurns)} tours</span>
          <button type="button" class="btn btn-outline btn-sm academy-play-drill" data-drill-id="${escapeHtml(drill.id)}">Jouer</button>
        </div>
      `;
      item.querySelector('.academy-play-drill')?.addEventListener('click', () => startDrill(drill.id));
      drillsEl.appendChild(item);
    }

    const weeklyEl = document.getElementById('academy-weekly');
    weeklyEl.innerHTML = weekly
      ? `
        <div class="academy-item recommended">
          <div class="academy-item-head">
            <strong>${escapeHtml(weekly.name || weekly.id || 'Scénario')}</strong>
            <span class="badge">${escapeHtml(weekly.brief?.difficulty || 'neutral')}</span>
          </div>
          <p class="text-muted">${escapeHtml(weekly.description || weekly.brief?.situation || '—')}</p>
          <div class="academy-meta">
            <span class="chip">${escapeHtml(weekly.id || 'scénario')}</span>
          </div>
        </div>
      `
      : '<p class="text-muted">Aucun scénario de la semaine.</p>';

    const leaderboardEl = document.getElementById('academy-leaderboard');
    if (weekly?.id) {
      const leaderboard = await api(`/api/leaderboard?scenarioId=${encodeURIComponent(weekly.id)}&limit=5`);
      leaderboardEl.innerHTML = '';
      if (!leaderboard.entries?.length) {
        leaderboardEl.innerHTML = '<p class="text-muted">Pas encore de sessions sur ce scénario.</p>';
      } else {
        leaderboard.entries.forEach((entry, index) => {
          const row = document.createElement('div');
          row.className = 'metric-row';
          row.innerHTML = `<span class="metric-label">#${index + 1} · ${escapeHtml(entry.sessionId)}</span><span class="metric-value">${escapeHtml(entry.score)} pts</span>`;
          leaderboardEl.appendChild(row);
        });
      }
    } else {
      renderAcademyPlaceholder('academy-leaderboard', 'Classement indisponible.');
    }

    const hallEl = document.getElementById('academy-hall');
    hallEl.innerHTML = '';
    if (!hall?.stories?.length) {
      hallEl.innerHTML = '<p class="text-muted">Pas encore de sessions légendaires.</p>';
    } else {
      for (const story of hall.stories) {
        const item = document.createElement('div');
        item.className = 'academy-item';
        item.innerHTML = `
          <div class="academy-item-head">
            <strong>${escapeHtml(story.title)}</strong>
            <span class="badge">${escapeHtml(story.score)} pts</span>
          </div>
          <p class="text-muted">${escapeHtml(story.excerpt)}</p>
        `;
        hallEl.appendChild(item);
      }
    }

    academyLoaded = true;
  } catch (err) {
    console.error('Academy load error:', err);
    renderAcademyPlaceholder('academy-profile', 'Impossible de charger le profil.');
    renderAcademyPlaceholder('academy-drills', 'Impossible de charger les exercices.');
    renderAcademyPlaceholder('academy-weekly', 'Impossible de charger le scénario de la semaine.');
    renderAcademyPlaceholder('academy-leaderboard', 'Impossible de charger le classement.');
    renderAcademyPlaceholder('academy-hall', 'Impossible de charger le panthéon.');
  }
}

async function loadDailyCard() {
  const root = document.getElementById('academy-daily');
  root.innerHTML = '<p class="text-muted">Chargement du daily…</p>';
  try {
    const daily = await api('/api/daily');
    academyDaily = daily;
    root.innerHTML = `
      <div class="academy-item recommended">
        <div class="academy-item-head">
          <strong>${escapeHtml(daily.targetSkill || 'Skill')}</strong>
          <span class="badge">${escapeHtml(daily.difficulty || 'neutral')}</span>
        </div>
        <p class="text-muted">${escapeHtml(daily.brief?.situation || '—')}</p>
        <div class="academy-meta">
          <span class="chip">${escapeHtml(daily.maxTurns)} tours</span>
          <span class="chip">${escapeHtml(daily.date || '')}</span>
        </div>
      </div>
    `;
  } catch (err) {
    academyDaily = null;
    console.error('Daily load error:', err);
    root.innerHTML = '<p class="text-muted">Impossible de générer le daily.</p>';
  }
}

let dashboardScenarioOptionsLoaded = false;

async function ensureDashboardScenarioOptions() {
  if (dashboardScenarioOptionsLoaded) return;

  const select = document.getElementById('d-filter-scenario');
  if (!select) return;

  try {
    const scenarios = await api('/api/scenarios');
    const options = scenarios
      .slice()
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), 'fr'));

    for (const scenario of options) {
      const option = document.createElement('option');
      option.value = scenario.id;
      option.textContent = scenario.name || scenario.id;
      select.appendChild(option);
    }

    dashboardScenarioOptionsLoaded = true;
  } catch (err) {
    console.error('Dashboard scenarios load error:', err);
  }
}

async function loadDashboard() {
  try {
    await ensureDashboardScenarioOptions();
    const filters = getDashboardFilters();
    const snapshot = await api(withPlayerQuery('/api/dashboard/player', filters));
    const stats = {
      ...(snapshot.stats || {}),
      autonomy: snapshot.autonomy,
      belts: snapshot.card?.belts || {},
      beltDefinitions: snapshot.beltDefinitions || [],
      weakDimensions: snapshot.card?.weaknesses || [],
      realWorldStats: snapshot.realWorldStats,
    };
    const empty = (stats.totalSessions || 0) === 0;
    const realStats = stats.realWorldStats || { totalReal: 0, avgSelfScore: 0, transferRate: 0, topLearning: null };

    document.getElementById('d-empty').classList.toggle('hidden', !empty);
    document.querySelector('.stats-grid').classList.toggle('hidden', empty);
    document.querySelectorAll('#view-dashboard .grid-2').forEach((el) => el.classList.toggle('hidden', empty));

    const realStatsRoot = document.getElementById('d-real-stats');
    realStatsRoot.classList.toggle('hidden', !realStats.totalReal);
    document.getElementById('d-real-count').textContent = realStats.totalReal || 0;
    document.getElementById('d-real-score').textContent = realStats.totalReal ? `${realStats.avgSelfScore}/10` : '—';
    document.getElementById('d-transfer').textContent = realStats.totalReal ? `${realStats.transferRate}%` : '—';

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
      weakEl.innerHTML = '<p class="text-muted">Pas encore de données</p>';
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

    const bestDimension = stats.bestDimension?.dimension
      ? `${DIMENSION_LABELS[stats.bestDimension.dimension]?.label || stats.bestDimension.dimension} — ${stats.bestDimension.average}/${DIMENSION_LABELS[stats.bestDimension.dimension]?.max || 100}`
      : '—';
    document.getElementById('d-best-dimension').textContent = realStats.topLearning
      ? `${bestDimension} · Apprentissage réel: ${realStats.topLearning}`
      : bestDimension;

    const historyEl = document.getElementById('d-history');
    historyEl.innerHTML = '';
    if (!stats.scoreHistory?.length) {
      historyEl.innerHTML = '<p class="text-muted">Pas encore de données</p>';
    } else {
      for (const entry of stats.scoreHistory) {
        const chip = document.createElement('div');
        chip.className = 'chip';
        const modeLabel = MODE_LABELS[entry.mode] || entry.mode;
        chip.innerHTML = `<strong>${entry.score}</strong> · ${modeLabel}`;
        historyEl.appendChild(chip);
      }
    }

    renderMetricList('d-dimensions', stats.dimensionAverages?.map((entry) => ({
      ...entry,
      dimension: DIMENSION_LABELS[entry.dimension]?.label || entry.dimension,
      max: DIMENSION_LABELS[entry.dimension]?.max || 100,
    })), 'dimension', (entry) => `${entry.average}/${entry.max}`);

    renderMetricList('d-modes', stats.modeBreakdown?.map((entry) => ({
      ...entry,
      mode: MODE_LABELS[entry.mode] || entry.mode,
    })), 'mode', (entry) => `${entry.count} sessions`);

    renderMetricList('d-difficulties', stats.difficultyBreakdown?.map((entry) => ({
      ...entry,
      difficulty: DIFFICULTY_LABELS[entry.difficulty] || entry.difficulty,
    })), 'difficulty', (entry) => `${entry.count} sessions`);
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

    const tutorials = presets.filter((p) => p.category === 'tutorial');
    const basics = presets.filter((p) => !p.category);
    const swiss = presets.filter((p) => p.category === 'swiss');
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

    renderGroup('Commencer ici', tutorials);
    renderGroup('Situations classiques', basics);
    renderGroup('Immobilier suisse', swiss);
    renderGroup('Personnalités célèbres', celebrities);
    renderGroup('Scénarios extrêmes', extremes);

    presetsLoaded = true;
  } catch (err) {
    console.error('Presets load error:', err);
  }
}

let pendingScenarioFile = null;
let pendingBrief = null;

async function launchScenario(scenarioFile, options = {}) {
  try {
    const briefing = await post('/api/briefing', { scenarioFile });
    pendingScenarioFile = scenarioFile;
    pendingBrief = null;
    pendingSessionMeta = options;
    showBriefing(briefing);
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

async function startDrill(drillId) {
  try {
    const session = await post(`/api/drills/${encodeURIComponent(drillId)}/start`, withPlayerPayload({}));
    startNegotiation(session);
  } catch (err) {
    alert('Erreur : ' + err.message);
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
    pendingSessionMeta = null;
    showBriefing(briefing);
    return;
  } catch (err) { /* fallback to direct start */ }

  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Chargement...';

  try {
    const session = await post('/api/session', withPlayerPayload({ brief }));
    startNegotiation(session);
  } catch (err) {
    alert('Erreur : ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Lancer la session';
  }
});

document.getElementById('versus-run').addEventListener('click', async () => {
  const form = document.getElementById('versus-form');
  const resultEl = document.getElementById('versus-result');
  const payload = {
    brief: {
      situation: form.querySelector('[name="situation"]').value.trim(),
      userRole: form.querySelector('[name="userRole"]').value.trim(),
      adversaryRole: form.querySelector('[name="adversaryRole"]').value.trim(),
      objective: form.querySelector('[name="objective"]').value.trim(),
      minimalThreshold: form.querySelector('[name="minimalThreshold"]').value.trim(),
      batna: form.querySelector('[name="batna"]').value.trim(),
    },
    playerA: { name: 'Message A', message: form.querySelector('[name="messageA"]').value.trim() },
    playerB: { name: 'Message B', message: form.querySelector('[name="messageB"]').value.trim() },
  };

  if (Object.values(payload.brief).some((value) => !value) || !payload.playerA.message || !payload.playerB.message) {
    resultEl.textContent = 'Remplis tous les champs du Versus Lab.';
    return;
  }

  resultEl.innerHTML = '<div class="spinner">Arbitrage en cours...</div>';

  try {
    const verdict = await post('/api/versus', payload);
    const winner = verdict.winner === 'playerA' ? 'Message A' : verdict.winner === 'playerB' ? 'Message B' : 'Match nul';
    resultEl.innerHTML = [
      `Vainqueur : ${winner}`,
      `Score A : ${verdict.scoreA?.total ?? '—'} | Score B : ${verdict.scoreB?.total ?? '—'}`,
      verdict.rationale || '',
      verdict.coachingA?.length ? `Coach A : ${verdict.coachingA.join(' · ')}` : '',
      verdict.coachingB?.length ? `Coach B : ${verdict.coachingB.join(' · ')}` : '',
    ].filter(Boolean).join('\n\n');
  } catch (err) {
    resultEl.textContent = `Erreur : ${err.message}`;
  }
});

// ============================================================
// NEGOTIATION
// ============================================================

let currentSessionId = null;
let currentBrief = null;

function startNegotiation(session) {
  currentSessionId = session.sessionId;
  pendingScenarioFile = null;
  pendingBrief = null;
  pendingSessionMeta = null;
  navigate('negotiate');

  document.getElementById('n-adversary').textContent = session.adversary?.identity || '—';
  document.getElementById('n-act').textContent = 'Ouverture';
  document.getElementById('n-turn').textContent = `Tour 0/${session.state?.maxTurns || 12}`;
  document.getElementById('n-status').textContent = 'active';
  document.getElementById('n-coaching').textContent = 'Le coaching apparaîtra après votre premier message.';
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
    addMessage('system', 'Session terminée par l\'utilisateur.');
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
  spinner.textContent = 'Réflexion en cours...';
  spinner.id = 'typing-spinner';
  document.getElementById('n-messages').appendChild(spinner);
  spinner.scrollIntoView({ behavior: 'smooth' });

  try {
    const result = await post(`/api/session/${encodeURIComponent(currentSessionId)}/turn`, { message: text });

    // Remove spinner
    document.getElementById('typing-spinner')?.remove();
    sendBtn.classList.remove('loading');

    const adversaryText = result.adversaryResponse || '[silence]';
    addMessage('adversary', adversaryText);
    speakText(adversaryText);

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

    // Mobile gauges
    updateMobileGauges(result.ticker, result.roundScore);

    // Session over?
    if (result.sessionOver) {
      addMessage('system', `Session terminée : ${result.endReason || 'fin'}`);
      hideGuidedChoices();
      endSession(result.feedback, result.fightCard);
    } else {
      // Show guided choices if provided
      if (result.guidedChoiceFeedback?.lesson) {
        addMessage('system', `Coach guidé : ${result.guidedChoiceFeedback.lesson}`);
      }

      if (result.guidedChoices && result.guidedChoices.length > 0) {
        showGuidedChoices(result.guidedChoices);
      } else {
        hideGuidedChoices();
        input.disabled = false;
        document.getElementById('btn-send').disabled = false;
        input.focus();
      }
    }
  } catch (err) {
    document.getElementById('typing-spinner')?.remove();
    sendBtn.classList.remove('loading');
    addMessage('system', `Erreur : ${err.message}`);
    input.disabled = false;
    sendBtn.disabled = false;
  }
});

function endSession(feedback, fightCard) {
  const endedSessionId = currentSessionId;
  currentSessionId = null;
  document.getElementById('msg-input').disabled = true;
  document.getElementById('btn-send').disabled = true;

  if (feedback || fightCard) {
    setTimeout(() => {
      showResults(feedback, fightCard);
      // For real-prep sessions, offer prep sheet
      if (lastRealPrepSessionId) {
        const actions = document.querySelector('.results-actions');
        if (actions) {
          const prepBtn = document.createElement('button');
          prepBtn.className = 'btn btn-primary';
          prepBtn.textContent = 'Voir ma fiche de préparation';
          prepBtn.addEventListener('click', () => showPrepSheet(lastRealPrepSessionId));
          actions.prepend(prepBtn);
        }
        lastRealPrepSessionId = null;
      }
    }, 1500);
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
    parts.push(`<span class="coaching-bias">Biais : ${result.coaching.biasDetected}</span>`);
  }

  el.innerHTML = parts.length > 0 ? parts.join('<br><br>') : 'Rien à signaler.';
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

function openSimulationModal({ batch = false } = {}) {
  const currentDraft = document.getElementById('msg-input').value.trim();
  if (!currentDraft || !currentSessionId) return;

  document.getElementById('sim-single-input').value = currentDraft;
  document.getElementById('sim-batch-input').value = batch
    ? [currentDraft, '', '', '', ''].join('\n')
    : currentDraft;
  document.getElementById('sim-results').innerHTML = '';
  document.getElementById('simulate-modal').classList.remove('hidden');
}

document.getElementById('btn-simulate').addEventListener('click', () => openSimulationModal());
document.getElementById('btn-simulate-batch').addEventListener('click', () => openSimulationModal({ batch: true }));

document.getElementById('sim-run-single').addEventListener('click', async () => {
  const text = document.getElementById('sim-single-input').value.trim();
  if (!text || !currentSessionId) return;

  const results = document.getElementById('sim-results');
  results.innerHTML = '<div class="loading"><div class="spinner">Simulation en cours...</div></div>';

  try {
    const report = await post(`/api/session/${encodeURIComponent(currentSessionId)}/simulate`, { message: text });
    renderSimulation(report);
  } catch (err) {
    results.innerHTML = `<p style="color:var(--red)">Erreur : ${err.message}</p>`;
  }
});

document.getElementById('sim-run-batch').addEventListener('click', async () => {
  const messages = document.getElementById('sim-batch-input').value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (messages.length === 0 || !currentSessionId) return;

  const results = document.getElementById('sim-results');
  results.innerHTML = '<div class="loading"><div class="spinner">Comparaison des variantes...</div></div>';

  try {
    const batch = await post(`/api/session/${encodeURIComponent(currentSessionId)}/simulate-batch`, { messages });
    renderSimulationBatch(messages, batch);
  } catch (err) {
    results.innerHTML = `<p style="color:var(--red)">Erreur : ${err.message}</p>`;
  }
});

document.getElementById('sim-close').addEventListener('click', () => {
  document.getElementById('simulate-modal').classList.add('hidden');
});

function renderSimulation(report) {
  const results = document.getElementById('sim-results');
  const verdictLabel = { send: 'Envoyer', revise: 'À réviser', do_not_send: 'Ne pas envoyer' };

  results.innerHTML = `
    <div class="sim-card best">
      <div class="sim-verdict ${report.sendVerdict}">${verdictLabel[report.sendVerdict] || report.sendVerdict}</div>
      <div class="sim-score" style="color:${report.approvalScore > 65 ? 'var(--green)' : report.approvalScore > 40 ? 'var(--amber)' : 'var(--red)'}">${report.approvalScore}/100</div>
      <p style="text-align:center;color:var(--text-muted);margin-bottom:16px">${report.predictedOutcome}</p>

      <div class="sim-section">
        <h4>Réaction simulée de l'adversaire</h4>
        <p style="font-style:italic;color:var(--text-2);padding:8px 12px;background:var(--bg);border-radius:8px">"${report.simulatedResponse}"</p>
      </div>

      ${report.strengths?.length ? `<div class="sim-section"><h4>Points forts</h4><ul class="sim-list">${report.strengths.map((s) => `<li>${s}</li>`).join('')}</ul></div>` : ''}
      ${report.vulnerabilities?.length ? `<div class="sim-section"><h4>Vulnérabilités</h4><ul class="sim-list">${report.vulnerabilities.map((v) => `<li>${v}</li>`).join('')}</ul></div>` : ''}
      ${report.likelyObjections?.length ? `<div class="sim-section"><h4>Objections probables</h4><ul class="sim-list">${report.likelyObjections.map((o) => `<li>${o}</li>`).join('')}</ul></div>` : ''}
      ${report.recommendedRewrite ? `<div class="sim-section"><h4>Reformulation suggérée</h4><div class="sim-rewrite">${report.recommendedRewrite}</div></div>` : ''}
    </div>
  `;
}

function renderSimulationBatch(messages, batch) {
  const results = document.getElementById('sim-results');
  const verdictLabel = { send: 'Envoyer', revise: 'À réviser', do_not_send: 'Ne pas envoyer' };
  const summary = batch.summary ? `
    <div class="sim-card best" style="margin-bottom:16px">
      <div class="sim-card-head">
        <strong>Résumé décisionnel</strong>
        <span class="badge">${escapeHtml(batch.summary.confidence || '')}</span>
      </div>
      <p class="text-muted">${escapeHtml(batch.summary.headline || '')}</p>
      ${typeof batch.summary.scoreGap === 'number' ? `<p class="text-muted">Écart avec la variante suivante: ${batch.summary.scoreGap} point(s)</p>` : ''}
      ${batch.summary.recommendedRewrite ? `<div class="sim-section"><h4>Rewrite recommandé</h4><div class="sim-rewrite">${escapeHtml(batch.summary.recommendedRewrite)}</div></div>` : ''}
    </div>
  ` : '';
  const cards = (batch.reports || []).map((report, index) => {
    const isBest = index === batch.bestIndex;
    const riskLabel = report.riskLevel === 'low' ? 'Risque faible' : report.riskLevel === 'medium' ? 'Risque moyen' : 'Risque élevé';
    return `
      <div class="sim-card ${isBest ? 'best' : ''}">
        <div class="sim-card-head">
          <strong>${isBest ? 'Meilleure variante' : `Variante ${index + 1}`}</strong>
          <span class="badge">${report.approvalScore}/100</span>
        </div>
        <div class="sim-variant">${escapeHtml(messages[index] || '')}</div>
        <div class="sim-card-meta">
          <span class="badge">${verdictLabel[report.sendVerdict] || report.sendVerdict}</span>
          <span class="chip">${riskLabel}</span>
        </div>
        <p class="text-muted">${escapeHtml(report.predictedOutcome || '')}</p>
        ${report.recommendedRewrite ? `<div class="sim-section"><h4>Reformulation suggérée</h4><div class="sim-rewrite">${escapeHtml(report.recommendedRewrite)}</div></div>` : ''}
      </div>
    `;
  }).join('');

  results.innerHTML = `${summary}${cards}` || '<p class="text-muted">Aucun résultat.</p>';
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
      ${briefing.playerRole ? `<span class="role-tag">Vous : ${briefing.playerRole}</span>` : ''}
      ${briefing.adversaryRole ? `<span class="role-tag">Face à : ${briefing.adversaryRole}</span>` : ''}
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
    Object.assign(payload, pendingSessionMeta || {});

    const session = await post('/api/session', withPlayerPayload(payload));
    startNegotiation(session);
  } catch (err) {
    alert('Erreur : ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Accepter le défi';
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
  cumulEl.textContent = `Cumulatif : ${roundScore.cumulativeScore > 0 ? '+' : ''}${roundScore.cumulativeScore}`;
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
      document.getElementById('r-discovery').textContent = `Objectif caché : ${t.hintsDiscovered}/${t.totalHints} indices découverts`;
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
    biasEl.innerHTML = '<p class="text-muted">Aucun biais détecté. Bravo !</p>';
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
    tacEl.innerHTML = '<p class="text-muted">Aucune tactique identifiée</p>';
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

  // Theory analysis
  if (fightCard?.theory) renderTheory(fightCard.theory);
}

// ============================================================
// HISTORY
// ============================================================

async function loadHistory() {
  try {
    const sessions = await api(withPlayerQuery('/api/sessions'));
    const listEl = document.getElementById('h-list');
    const emptyEl = document.getElementById('h-empty');

    if (sessions.length === 0) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      document.getElementById('history-replay').classList.add('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    listEl.innerHTML = '';
    document.getElementById('history-replay').classList.add('hidden');

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
        <button type="button" class="btn btn-outline btn-sm history-replay-btn">Replay</button>
      `;
      row.querySelector('.history-replay-btn').addEventListener('click', () => loadReplay(s.id));
      listEl.appendChild(row);
    }
  } catch (err) {
    console.error('History load error:', err);
  }
}

async function loadReplay(sessionId) {
  try {
    const replay = await api(withPlayerQuery(`/api/sessions/${encodeURIComponent(sessionId)}/replay`));
    const container = document.getElementById('history-replay');
    const summary = document.getElementById('history-replay-summary');
    const turns = document.getElementById('history-replay-turns');

    summary.textContent = replay.summary || `Replay pour ${sessionId}`;
    turns.innerHTML = '';

    for (const turn of replay.turns || []) {
      const item = document.createElement('div');
      item.className = 'academy-item';
      item.innerHTML = `
        <div class="academy-item-head">
          <strong>Tour ${escapeHtml(turn.turnNumber)}</strong>
          <span class="badge">${escapeHtml(turn.momentumLabel || 'stable')}</span>
        </div>
        <p>${escapeHtml(turn.annotation || '—')}</p>
        ${turn.biasDetected ? `<p class="text-muted">Biais : ${escapeHtml(turn.biasDetected)}</p>` : ''}
        ${turn.alternativeSuggestion ? `<p class="text-muted">Alternative : ${escapeHtml(turn.alternativeSuggestion)}</p>` : ''}
      `;
      turns.appendChild(item);
    }

    container.classList.remove('hidden');
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error('Replay load error:', err);
  }
}

// ============================================================
// QUIT button
// ============================================================

// Strategic silence — sends "..." as the player's message
document.getElementById('btn-silence')?.addEventListener('click', () => {
  if (!currentSessionId) return;
  const input = document.getElementById('msg-input');
  input.value = '...';
  document.getElementById('turn-form').dispatchEvent(new Event('submit'));
});

document.getElementById('btn-quit').addEventListener('click', () => {
  if (currentSessionId && confirm('Quitter la session en cours ?')) {
    addMessage('system', 'Session abandonnée.');
    endSession(null);
    setTimeout(() => navigate('dashboard'), 1000);
  }
});

document.getElementById('academy-refresh')?.addEventListener('click', () => {
  academyLoaded = false;
  academyWeekly = null;
  loadAcademy(true);
  loadDailyCard();
});

document.getElementById('academy-load-daily')?.addEventListener('click', () => {
  loadDailyCard();
});

document.getElementById('academy-play-daily')?.addEventListener('click', async () => {
  try {
    const daily = academyDaily || await api('/api/daily');
    academyDaily = daily;
    pendingScenarioFile = null;
    pendingBrief = daily.brief;
    pendingSessionMeta = { mode: 'daily', dailyMeta: { date: daily.date, targetSkill: daily.targetSkill, difficulty: daily.difficulty } };
    const briefing = await post('/api/briefing', { brief: daily.brief });
    showBriefing(briefing);
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
});

document.getElementById('academy-play-weekly')?.addEventListener('click', () => {
  if (!academyWeekly?.id) {
    alert('Scénario de la semaine indisponible pour le moment.');
    return;
  }
  launchScenario(academyWeekly.id, { mode: 'weekly' });
});

document.getElementById('academy-export-hall')?.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/hall-of-fame/export?limit=5');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'negotiateai-hall-of-fame.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
});

// ============================================================
// VOICE MODE (Web Speech API — zero deps)
// ============================================================

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecording = false;

const voiceBtn = document.getElementById('btn-voice');
const ttsCheckbox = document.getElementById('chk-tts');

// Speech-to-Text: player speaks → text input
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'fr-FR';
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    const input = document.getElementById('msg-input');
    let transcript = '';
    for (const result of event.results) {
      transcript += result[0].transcript;
    }
    input.value = transcript;
  };

  recognition.onend = () => {
    isRecording = false;
    voiceBtn.classList.remove('recording');
    voiceBtn.innerHTML = '&#127908; Parler';
  };

  recognition.onerror = (event) => {
    isRecording = false;
    voiceBtn.classList.remove('recording');
    voiceBtn.innerHTML = '&#127908; Parler';
    if (event.error !== 'aborted' && event.error !== 'no-speech') {
      console.error('Speech recognition error:', event.error);
    }
  };

  voiceBtn.addEventListener('click', () => {
    if (!currentSessionId) return;
    if (isRecording) {
      recognition.stop();
    } else {
      isRecording = true;
      voiceBtn.classList.add('recording');
      voiceBtn.innerHTML = '&#128308; Écoute...';
      recognition.start();
    }
  });
} else {
  voiceBtn.style.display = 'none';
}

// Text-to-Speech: adversary response read aloud
function speakText(text) {
  if (!ttsCheckbox.checked) return;
  if (!window.speechSynthesis) return;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'fr-FR';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  // Try to find a French voice
  const voices = window.speechSynthesis.getVoices();
  const frenchVoice = voices.find((v) => v.lang.startsWith('fr')) || null;
  if (frenchVoice) utterance.voice = frenchVoice;

  window.speechSynthesis.speak(utterance);
}

// Ensure voices are loaded (Chrome loads them async)
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {};
}

// ============================================================
// REAL PREP MODE
// ============================================================

let lastRealPrepSessionId = null;

document.getElementById('real-prep-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = {};
  for (const el of form.querySelectorAll('input, textarea')) {
    if (el.name && el.value) data[el.name] = el.value;
  }
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    const session = await post('/api/real-prep/start', withPlayerPayload(data));
    lastRealPrepSessionId = session.sessionId;
    startNegotiation(session);
  } catch (err) {
    alert('Erreur : ' + err.message);
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
});

// ============================================================
// JOURNAL
// ============================================================

document.getElementById('journal-score')?.addEventListener('input', (e) => {
  document.getElementById('journal-score-label').textContent = `${e.target.value}/10`;
});

document.getElementById('journal-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = {};
  for (const el of form.querySelectorAll('input, textarea, input[type=range], input[type=hidden]')) {
    if (el.name) data[el.name] = el.type === 'range' ? Number(el.value) : el.value;
  }
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    const result = await post('/api/journal', withPlayerPayload(data));
    const container = document.getElementById('journal-result');
    container.classList.remove('hidden');
    document.getElementById('journal-summary').textContent = result.comparison?.summary || 'Débrief enregistré.';
    const insightsEl = document.getElementById('journal-insights');
    insightsEl.innerHTML = '';
    for (const insight of (result.comparison?.insights || [])) {
      const cls = insight.type === 'positive' ? 'positive' : insight.type === 'warning' ? 'high' : 'medium';
      const card = document.createElement('div');
      card.className = `theory-card ${cls}`;
      card.innerHTML = `<div class="theory-observation">${insight.text}</div>`;
      insightsEl.appendChild(card);
    }
    container.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    alert('Erreur : ' + err.message);
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
});

// ============================================================
// PREP SHEET
// ============================================================

async function showPrepSheet(sessionId) {
  navigate('prep-sheet');
  const container = document.getElementById('prep-sheet-content');
  container.innerHTML = '<div class="loading"><div class="spinner">Génération de la fiche...</div></div>';
  try {
    const sheet = await api(withPlayerQuery(`/api/sessions/${encodeURIComponent(sessionId)}/prep-sheet`));
    container.innerHTML = `
      <div class="prep-opening">"${sheet.openingLine}"</div>
      <div class="prep-section card"><h3>Arguments clés</h3><ol class="prep-list">${(sheet.keyArguments || []).map((a) => `<li>${a}</li>`).join('')}</ol></div>
      <div class="prep-section card"><h3>Lignes rouges</h3><ul class="prep-list">${(sheet.redLines || []).map((r) => `<li style="color:var(--red)">${r}</li>`).join('')}</ul></div>
      <div class="prep-section card"><h3>Pièges à éviter</h3><ul class="prep-list">${(sheet.trapsToAvoid || []).map((t) => `<li style="color:var(--amber)">${t}</li>`).join('')}</ul></div>
      ${(sheet.ifTheyDo || []).length > 0 ? `<div class="prep-section card"><h3>Si l'adversaire...</h3>${sheet.ifTheyDo.map((s) => `<div class="prep-if-card"><div class="prep-if-trigger">${s.trigger}</div><div class="prep-if-response">${s.response}</div>${s.why ? `<div class="prep-if-why">${s.why}</div>` : ''}</div>`).join('')}</div>` : ''}
      <div class="prep-section card"><h3>Rappel BATNA</h3><p style="font-weight:600">${sheet.batnaReminder || '—'}</p></div>
      <div class="prep-confidence">${sheet.confidenceBooster || 'Tu es prêt.'}</div>
      <div class="prep-one-thing">${sheet.oneThingToRemember || '—'}</div>
    `;
    const simInput = document.getElementById('journal-sim-id');
    if (simInput) simInput.value = sessionId;
  } catch (err) {
    container.innerHTML = `<p style="color:var(--red)">Erreur : ${err.message}</p>`;
  }
}

// ============================================================
// SLIDERS + EXPERT TOGGLE
// ============================================================

// Slider live labels
['ambition', 'relation', 'posture'].forEach((name) => {
  const slider = document.getElementById(`sl-${name}`);
  const label = document.getElementById(`sl-${name}-label`);
  if (slider && label) {
    slider.addEventListener('input', () => {
      label.textContent = `${name.charAt(0).toUpperCase() + name.slice(1)} : ${slider.value}`;
    });
  }
});

// Expert mode toggle
document.getElementById('toggle-expert-briefing')?.addEventListener('click', () => {
  const sliderForm = document.getElementById('briefing-slider-form');
  const expertForm = document.getElementById('briefing-form');
  const btn = document.getElementById('toggle-expert-briefing');
  if (sliderForm.classList.contains('hidden')) {
    sliderForm.classList.remove('hidden');
    expertForm.classList.add('hidden');
    btn.textContent = 'Mode expert';
  } else {
    sliderForm.classList.add('hidden');
    expertForm.classList.remove('hidden');
    btn.textContent = 'Mode rapide';
  }
});

// Slider form submit → create session with sliders
document.getElementById('briefing-slider-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    const sliders = {
      ambition: Number(document.getElementById('sl-ambition').value),
      relation: Number(document.getElementById('sl-relation').value),
      posture: Number(document.getElementById('sl-posture').value),
    };
    const payload = { sliders, uiProgressive: true };
    if (pendingScenarioFile) payload.scenarioFile = pendingScenarioFile;
    else if (pendingBrief) payload.brief = pendingBrief;
    Object.assign(payload, pendingSessionMeta || {});
    const session = await post('/api/session', withPlayerPayload(payload));
    startNegotiation(session);
  } catch (err) {
    alert('Erreur : ' + err.message);
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
});

// ============================================================
// GUIDED ROUNDS
// ============================================================

let currentGuidedChoices = null;

function showGuidedChoices(choices) {
  if (!choices || choices.length === 0) {
    hideGuidedChoices();
    return;
  }
  currentGuidedChoices = choices;
  const container = document.getElementById('guided-choices');
  const btns = document.getElementById('guided-btns');
  container.classList.remove('hidden');

  // Hide the free text input
  document.getElementById('turn-form').classList.add('hidden');

  btns.innerHTML = '';
  choices.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.className = 'guided-choice';
    btn.innerHTML = `${c.text}<span class="choice-technique">${c.technique}</span>`;
    btn.addEventListener('click', () => selectGuidedChoice(i));
    btns.appendChild(btn);
  });
}

function hideGuidedChoices() {
  currentGuidedChoices = null;
  document.getElementById('guided-choices')?.classList.add('hidden');
  document.getElementById('turn-form')?.classList.remove('hidden');
}

async function selectGuidedChoice(index) {
  const choice = currentGuidedChoices[index];
  if (!choice || !currentSessionId) return;

  const choices = currentGuidedChoices;
  hideGuidedChoices();
  addMessage('user', choice.text);

  const input = document.getElementById('msg-input');
  const sendBtn = document.getElementById('btn-send');
  input.value = '';
  input.disabled = true;
  sendBtn.disabled = true;
  sendBtn.classList.add('loading');

  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  spinner.textContent = 'Réflexion en cours...';
  spinner.id = 'typing-spinner';
  document.getElementById('n-messages').appendChild(spinner);
  spinner.scrollIntoView({ behavior: 'smooth' });

  try {
    const result = await post(`/api/session/${encodeURIComponent(currentSessionId)}/turn`, {
      message: choice.text,
      guidedChoiceIndex: index,
    });

    document.getElementById('typing-spinner')?.remove();
    sendBtn.classList.remove('loading');

    const adversaryText = result.adversaryResponse || '[silence]';
    addMessage('adversary', adversaryText);
    speakText(adversaryText);

    document.getElementById('n-turn').textContent = `Tour ${result.state.turn}/${12}`;
    document.getElementById('n-status').textContent = result.state.status;

    if (result.actTransition) {
      document.getElementById('n-act').textContent = result.actTransition.replace(/^[^\s]+\s/, '');
      addMessage('system', result.actTransition);
    }

    if (result.ticker) updateGauges(result.ticker);
    updateCoaching(result);
    updateSignals(result.detectedSignals);
    if (result.roundScore) updateRoundScore(result.roundScore);
    updateMobileGauges(result.ticker, result.roundScore);

    if (result.guidedChoiceFeedback?.lesson) {
      addMessage('system', `Coach guide: ${result.guidedChoiceFeedback.lesson}`);
    }

    if (result.sessionOver) {
      addMessage('system', `Session terminée : ${result.endReason || 'fin'}`);
      hideGuidedChoices();
      endSession(result.feedback, result.fightCard);
      return;
    }

    currentGuidedChoices = choices;
    if (result.guidedChoices && result.guidedChoices.length > 0) {
      showGuidedChoices(result.guidedChoices);
    } else {
      hideGuidedChoices();
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  } catch (err) {
    document.getElementById('typing-spinner')?.remove();
    sendBtn.classList.remove('loading');
    addMessage('system', `Erreur : ${err.message}`);
    input.disabled = false;
    sendBtn.disabled = false;
    currentGuidedChoices = choices;
    showGuidedChoices(choices);
  }
}

// ============================================================
// THEORY RENDERING
// ============================================================

const FRAMEWORK_NAMES = {
  harvard: 'Harvard (Fisher & Ury)',
  voss: 'Empathie tactique (Voss)',
  cialdini: 'Influence (Cialdini)',
  kahneman: 'Biais cognitifs (Kahneman)',
  schelling: 'Théorie des jeux (Schelling)',
};

function renderTheory(theoryAnalysis) {
  const section = document.getElementById('r-theory-section');
  if (!section) return;
  if (!theoryAnalysis || !theoryAnalysis.insights?.length) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  document.getElementById('r-theory-summary').textContent = theoryAnalysis.summary || '';

  const container = document.getElementById('r-theory-insights');
  container.innerHTML = '';
  for (const insight of theoryAnalysis.insights) {
    const card = document.createElement('div');
    card.className = `theory-card ${insight.severity}`;
    card.innerHTML = `
      <div class="theory-framework">${FRAMEWORK_NAMES[insight.framework] || insight.framework} — ${insight.principle}</div>
      <div class="theory-observation">${insight.observation}</div>
      ${insight.recommendation ? `<div class="theory-recommendation">${insight.recommendation}</div>` : ''}
    `;
    container.appendChild(card);
  }
}

// ============================================================
// THEME SWITCHER + RATING
// ============================================================

const THEMES = ['obsidian', 'terminal', 'poker', 'dojo', 'neon'];
const THEME_NAMES = { obsidian: 'Obsidian', terminal: 'Terminal', poker: 'Poker', dojo: 'Dojo', neon: 'Neon' };
let currentTheme = localStorage.getItem('negotiate-theme') || 'obsidian';
const themeRatings = JSON.parse(localStorage.getItem('negotiate-theme-ratings') || '{}');

function applyTheme(theme) {
  document.body.className = `theme-${theme}`;
  currentTheme = theme;
  localStorage.setItem('negotiate-theme', theme);
  document.querySelectorAll('.theme-btn').forEach((b) => b.classList.toggle('active', b.dataset.theme === theme));
  renderThemeRating(theme);
}

function renderThemeRating(theme) {
  const container = document.getElementById('theme-rating');
  const rating = themeRatings[theme] || 0;
  container.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('button');
    star.className = `theme-star ${i <= rating ? 'filled' : ''}`;
    star.textContent = i <= rating ? '\u2605' : '\u2606';
    star.addEventListener('click', () => rateTheme(theme, i));
    container.appendChild(star);
  }
}

function rateTheme(theme, rating) {
  themeRatings[theme] = rating;
  localStorage.setItem('negotiate-theme-ratings', JSON.stringify(themeRatings));
  renderThemeRating(theme);
}

// Wire theme buttons
document.getElementById('theme-toggle').addEventListener('click', () => {
  document.getElementById('theme-panel').classList.toggle('open');
});

document.querySelectorAll('.theme-btn').forEach((btn) => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
});

applyTheme(currentTheme);

// ============================================================
// MOBILE MINI-GAUGES
// ============================================================

function updateMobileGauges(ticker, roundScore) {
  const mg = (id, val, color) => {
    const el = document.getElementById(id);
    if (el) { el.textContent = val; el.style.color = color || 'var(--text)'; }
  };
  if (ticker) {
    mg('mg-deal', ticker.dealQuality + '%', ticker.dealQuality > 60 ? 'var(--green)' : ticker.dealQuality < 35 ? 'var(--red)' : 'var(--amber)');
    mg('mg-lev', (ticker.leverage > 0 ? '+' : '') + ticker.leverage, ticker.leverage > 10 ? 'var(--green)' : ticker.leverage < -10 ? 'var(--red)' : 'var(--text-2)');
    mg('mg-bias', ticker.biasRisk + '%', ticker.biasRisk > 60 ? 'var(--red)' : 'var(--green)');
    mg('mg-prob', ticker.dealProbability + '%', ticker.dealProbability > 50 ? 'var(--green)' : 'var(--amber)');
    const arrow = ticker.momentumTrend === 'gaining' ? '\u2191' : ticker.momentumTrend === 'losing' ? '\u2193' : '\u2192';
    mg('mg-mom', arrow, ticker.momentumTrend === 'gaining' ? 'var(--green)' : ticker.momentumTrend === 'losing' ? 'var(--red)' : 'var(--amber)');
  }
  if (roundScore) {
    const sign = roundScore.points > 0 ? '+' : '';
    mg('mg-rnd', sign + roundScore.points, roundScore.points > 0 ? 'var(--green)' : roundScore.points < 0 ? 'var(--red)' : 'var(--text-muted)');
  }
}

// ============================================================
// INIT
// ============================================================

document.getElementById('dashboard-filters')?.addEventListener('change', () => {
  loadDashboard();
});

document.getElementById('d-filters-reset')?.addEventListener('click', () => {
  const form = document.getElementById('dashboard-filters');
  if (!form) return;
  form.reset();
  loadDashboard();
});

loadDashboard();
