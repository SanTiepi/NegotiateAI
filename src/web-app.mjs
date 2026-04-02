import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

import { buildBrief } from './scenario.mjs';
import { generatePersona } from './persona.mjs';
import { createSession, processTurn } from './engine.mjs';
import { analyzeFeedback } from './analyzer.mjs';
import { createAnthropicProvider } from './provider.mjs';
import { createStore, randomUUID } from './store.mjs';
import { refreshProgression } from './progression.mjs';
import { evaluateAutonomyLevel, describeAutonomyGap } from './autonomy.mjs';
import { BELT_DEFINITIONS } from './belt.mjs';
import { simulateBeforeSend } from './simulate.mjs';
import { selectScenarioOfWeek } from './leaderboard.mjs';
import { listScenarios } from '../scenarios/index.mjs';

const SCENARIO_PRESETS = [
  {
    id: 'salary',
    name: 'Négociation salariale',
    emoji: '💼',
    description: 'Vous demandez une augmentation à votre manager.',
    brief: {
      situation: 'Entretien annuel — vous êtes performant depuis 2 ans, pas d\'augmentation',
      userRole: 'Employé senior',
      adversaryRole: 'Manager direct',
      objective: 'Obtenir +15% de salaire',
      minimalThreshold: '+8% minimum acceptable',
      batna: 'Offre concurrente à +20% dans une autre entreprise',
      difficulty: 'neutral',
    },
  },
  {
    id: 'realestate',
    name: 'Achat immobilier',
    emoji: '🏠',
    description: 'Vous négociez le prix d\'un appartement.',
    brief: {
      situation: 'Achat d\'un 4 pièces à Lausanne, affiché à 850\'000 CHF',
      userRole: 'Acheteur',
      adversaryRole: 'Propriétaire vendeur',
      objective: 'Acheter à 780\'000 CHF',
      minimalThreshold: '820\'000 CHF maximum',
      batna: 'Deux autres biens similaires en visite cette semaine',
      difficulty: 'neutral',
    },
  },
  {
    id: 'freelance',
    name: 'Contrat freelance',
    emoji: '💻',
    description: 'Vous négociez un tarif journalier avec un client.',
    brief: {
      situation: 'Mission de 6 mois, client veut un TJM bas, vous êtes expert',
      userRole: 'Freelance développeur senior',
      adversaryRole: 'Directeur technique client',
      objective: 'TJM de 1\'200 CHF/jour',
      minimalThreshold: '950 CHF/jour minimum',
      batna: 'Pipeline de 3 autres missions potentielles',
      difficulty: 'hostile',
    },
  },
  {
    id: 'partnership',
    name: 'Partenariat startup',
    emoji: '🚀',
    description: 'Vous négociez un partenariat stratégique.',
    brief: {
      situation: 'Votre startup veut un partenariat de distribution avec un grand groupe',
      userRole: 'CEO de la startup',
      adversaryRole: 'VP Business Development du groupe',
      objective: 'Partenariat exclusif avec 30% de commission',
      minimalThreshold: 'Non-exclusif à 20% minimum',
      batna: 'Lancement en direct-to-consumer avec levée de fonds',
      difficulty: 'manipulative',
    },
  },
  {
    id: 'lease',
    name: 'Renégociation de bail',
    emoji: '🏢',
    description: 'Vous renégociez le loyer de vos bureaux.',
    brief: {
      situation: 'Fin de bail dans 3 mois, marché baissier, vous voulez rester',
      userRole: 'Directeur administratif',
      adversaryRole: 'Gérant de la régie immobilière',
      objective: 'Réduction de 15% du loyer + travaux offerts',
      minimalThreshold: 'Réduction de 8% du loyer sans travaux',
      batna: 'Trois offres de locaux équivalents à -20%',
      difficulty: 'cooperative',
    },
  },
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(__dirname, '..', 'web');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON body');
  }
}

async function serveStatic(res, filePath) {
  const content = await readFile(filePath);
  const type = MIME_TYPES[extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type });
  res.end(content);
}

export function createWebApp({ provider, sessionIdFactory, store: injectedStore } = {}) {
  const activeSessions = new Map();
  const llmProvider = provider || createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY });
  const nextSessionId = sessionIdFactory || (() => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const store = injectedStore || createStore();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/') {
        await serveStatic(res, join(WEB_DIR, 'index.html'));
        return;
      }

      if (req.method === 'GET' && /^\/(app\.js|styles\.css|favicon\.svg)$/.test(url.pathname)) {
        await serveStatic(res, join(WEB_DIR, url.pathname.slice(1)));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/health') {
        json(res, 200, { ok: true, sessions: activeSessions.size });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/dashboard') {
        const stats = await store.getDashboardStats();
        const progression = await store.loadProgression();
        const belts = progression.belts || {};
        const earnedCount = Object.values(belts).filter((b) => b.earned).length;
        const autonomy = evaluateAutonomyLevel({
          totalSessions: stats.totalSessions,
          avgScore: stats.averageScore,
          earnedBelts: earnedCount,
        });
        json(res, 200, {
          ...stats,
          autonomy: { level: autonomy.level, label: autonomy.label, key: autonomy.key, gap: describeAutonomyGap(autonomy), next: autonomy.next },
          beltDefinitions: BELT_DEFINITIONS.map((d) => ({ color: d.color, name: d.name, dimension: d.dimension, description: d.description })),
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/progression') {
        const progression = await store.loadProgression();
        json(res, 200, progression);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/scenarios') {
        json(res, 200, SCENARIO_PRESETS);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/scenario-of-week') {
        json(res, 200, selectScenarioOfWeek(await listScenarios()));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/hall-of-fame') {
        json(res, 200, await store.getHallOfFame({ limit: Number(url.searchParams.get('limit')) || 5 }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
        json(res, 200, await store.getScenarioLeaderboard(url.searchParams.get('scenarioId'), {
          limit: Number(url.searchParams.get('limit')) || 10,
        }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/sessions') {
        const sessions = await store.loadSessions();
        const summaries = sessions.slice(0, 20).map((s) => ({
          id: s.id,
          date: s.date,
          situation: s.brief?.situation || '—',
          difficulty: s.brief?.difficulty || 'neutral',
          status: s.status,
          turns: s.turns || s.transcript?.length || 0,
          score: s.feedback?.globalScore || 0,
          scores: s.feedback?.scores || {},
          biases: (s.feedback?.biasesDetected || []).map((b) => b.biasType),
          mode: s.mode || 'cli',
        }));
        json(res, 200, summaries);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/session') {
        const body = await readBody(req);
        const brief = buildBrief(body.brief);
        const adversary = body.adversary || await generatePersona(brief, llmProvider);
        const session = createSession(brief, adversary, llmProvider, { eventPolicy: body.eventPolicy || 'none' });
        const sessionId = nextSessionId();
        activeSessions.set(sessionId, session);

        json(res, 201, {
          sessionId,
          adversary: { identity: adversary.identity, style: adversary.style },
          state: { turn: session.turn, status: session.status, maxTurns: session.maxTurns },
        });
        return;
      }

      const turnMatch = req.method === 'POST' && url.pathname.match(/^\/api\/session\/([^/]+)\/turn$/);
      if (turnMatch) {
        const sessionId = decodeURIComponent(turnMatch[1]);
        const session = activeSessions.get(sessionId);
        if (!session) {
          json(res, 404, { error: 'Session not found' });
          return;
        }

        const body = await readBody(req);
        if (!body.message || !body.message.trim()) {
          json(res, 400, { error: 'message is required' });
          return;
        }

        const result = await processTurn(session, body.message);

        if (result.sessionOver) {
          const feedback = await analyzeFeedback(session, llmProvider);
          result.feedback = feedback;
          await store.saveSession({
            id: randomUUID(),
            date: new Date().toISOString(),
            brief: session.brief,
            adversary: session.adversary,
            transcript: session.transcript,
            status: session.status,
            turns: session.turn,
            feedback,
            mode: 'web',
            eventPolicy: session.eventPolicy,
            eventsActive: session.eventPolicy !== 'none',
            worldState: session._world ? { emotions: session._world.emotions, pad: session._world.pad } : null,
          });
          await refreshProgression(store, session);
          activeSessions.delete(sessionId);
        }

        json(res, 200, {
          adversaryResponse: result.adversaryResponse,
          sessionOver: result.sessionOver,
          endReason: result.endReason,
          state: {
            turn: result.state.turn,
            status: result.state.status,
            confidence: result.state.confidence,
            frustration: result.state.frustration,
            egoThreat: result.state.egoThreat,
          },
          coaching: result.coaching,
          ticker: result.ticker,
          actTransition: result.actTransition,
          detectedSignals: result.detectedSignals,
        });
        return;
      }

      const simMatch = req.method === 'POST' && url.pathname.match(/^\/api\/session\/([^/]+)\/simulate$/);
      if (simMatch) {
        const sessionId = decodeURIComponent(simMatch[1]);
        const session = activeSessions.get(sessionId);
        if (!session) { json(res, 404, { error: 'Session not found' }); return; }
        const body = await readBody(req);
        if (!body.message || !body.message.trim()) { json(res, 400, { error: 'message is required' }); return; }
        const report = await simulateBeforeSend({
          brief: session.brief, adversary: session.adversary,
          offerMessage: body.message, provider: llmProvider, transcript: session.transcript,
        });
        json(res, 200, report);
        return;
      }

      json(res, 404, { error: 'Not found' });
    } catch (error) {
      const status = /Missing required field|Invalid JSON body/.test(error.message) ? 400 : 500;
      json(res, status, { error: error.message });
    }
  });

  return {
    server,
    activeSessions,
    async listen(port = Number(process.env.PORT) || 3000, host = '127.0.0.1') {
      await new Promise((resolve) => server.listen(port, host, resolve));
      return server.address();
    },
    async close() {
      await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    },
  };
}

export async function startWebServer(options = {}) {
  const app = createWebApp(options);
  const address = await app.listen(options.port, options.host);
  return { ...app, address };
}
