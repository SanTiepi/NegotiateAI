// hall-of-fame.mjs — anonymized showcase generation for top sessions

const ROLE_ALIASES = ['Operateur', 'Strategiste', 'Negociateur', 'Partenaire', 'Analyste', 'Joueur'];
const ADVERSARY_ALIASES = ['Interlocuteur', 'Opposant', 'Decisionnaire', 'Vendeur', 'Manager', 'Contrepartie'];

function safeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function redactNumbers(text) {
  return text
    .replace(/\b\d{1,3}(?:[ '\u00A0]?\d{3})*(?:[.,]\d+)?\s?(?:CHF|EUR|€|\$)\b/gi, '[montant]')
    .replace(/\b\d+(?:[.,]\d+)?\s?%/g, '[pourcentage]');
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

export function anonymizeSessionTitle(session, index = 0) {
  const userAlias = ROLE_ALIASES[index % ROLE_ALIASES.length];
  const adversaryAlias = ADVERSARY_ALIASES[index % ADVERSARY_ALIASES.length];
  const situation = safeText(session?.brief?.situation) || 'negociation confidentielle';
  return `${userAlias} vs ${adversaryAlias} — ${redactNumbers(normalizeWhitespace(situation))}`;
}

export function buildHallOfFameExcerpt(session, options = {}) {
  const maxChars = Math.max(80, options.maxChars || 220);
  const transcript = Array.isArray(session?.transcript) ? session.transcript : [];
  const firstUser = transcript.find((entry) => entry?.role === 'user' && safeText(entry.content));
  const firstAdversary = transcript.find((entry) => entry?.role !== 'user' && safeText(entry.content));
  const feedback = Array.isArray(session?.feedback?.recommendations) ? session.feedback.recommendations : [];

  const parts = [
    firstUser ? `Ouverture: ${safeText(firstUser.content)}` : '',
    firstAdversary ? `Reponse: ${safeText(firstAdversary.content)}` : '',
    feedback[0] ? `Lecon: ${safeText(feedback[0])}` : '',
  ].filter(Boolean).map((part) => redactNumbers(normalizeWhitespace(part)));

  const excerpt = parts.join(' | ') || 'Session solide avec une execution disciplinée.';
  return excerpt.length > maxChars ? `${excerpt.slice(0, maxChars - 1).trimEnd()}…` : excerpt;
}

export function buildHallOfFameStories(sessions = [], options = {}) {
  const limit = Math.max(1, options.limit || 5);
  return sessions
    .filter((session) => Number.isFinite(Number(session?.feedback?.globalScore)))
    .sort((a, b) => {
      const scoreDiff = Number(b.feedback.globalScore || 0) - Number(a.feedback.globalScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(a.turns || 999) - Number(b.turns || 999);
    })
    .slice(0, limit)
    .map((session, index) => ({
      rank: index + 1,
      sessionId: session.id,
      title: anonymizeSessionTitle(session, index),
      excerpt: buildHallOfFameExcerpt(session, options),
      score: Number(session.feedback?.globalScore || 0),
      turns: Number(session.turns || 0),
      difficulty: session.brief?.difficulty || 'neutral',
      date: session.date || null,
      summary: safeText(session?.feedback?.recommendations?.[0]) || null,
    }));
}

export function formatHallOfFameStories(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return 'Aucune session eligible pour le hall of fame.';
  }

  return entries.map((entry) => (
    `#${entry.rank} · ${entry.title}\n` +
    `Score ${entry.score}/100 · ${entry.turns} tours · ${entry.difficulty}\n` +
    `${entry.excerpt}`
  )).join('\n\n');
}
