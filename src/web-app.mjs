import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

import { buildBrief } from './scenario.mjs';
import { generatePersona } from './persona.mjs';
import { createSession, processTurn } from './engine.mjs';
import { createAnthropicProvider } from './provider.mjs';

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

export function createWebApp({ provider, sessionIdFactory } = {}) {
  const activeSessions = new Map();
  const llmProvider = provider || createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY });
  const nextSessionId = sessionIdFactory || (() => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/') {
        await serveStatic(res, join(WEB_DIR, 'index.html'));
        return;
      }

      if (req.method === 'GET' && (url.pathname === '/app.js' || url.pathname === '/styles.css')) {
        await serveStatic(res, join(WEB_DIR, url.pathname.slice(1)));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/health') {
        json(res, 200, { ok: true, sessions: activeSessions.size });
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
          detectedSignals: result.detectedSignals,
        });
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
