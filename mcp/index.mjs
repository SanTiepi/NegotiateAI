// MCP Server for NegotiateAI — exposes negotiation tools via Model Context Protocol
// Transport: stdio | Tools: 7

import { readFileSync } from 'node:fs';
try { for (const l of readFileSync(new URL('../.env', import.meta.url), 'utf-8').split('\n')) { const [k, ...v] = l.split('='); if (k?.trim() && v.length) process.env[k.trim()] = v.join('=').trim(); } } catch {}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Import NegotiateAI modules
import { buildBrief } from '../src/scenario.mjs';
import { generatePersona } from '../src/persona.mjs';
import { createSession, processTurn } from '../src/engine.mjs';
import { analyzeFeedback } from '../src/analyzer.mjs';
import { generatePlan } from '../src/planner.mjs';
import { createAnthropicProvider } from '../src/provider.mjs';
import { createStore, randomUUID } from '../src/store.mjs';
import { evaluateBelts, identifyWeaknesses } from '../src/belt.mjs';
import { getMomentumTrend } from '../src/worldEngine.mjs';
import { computeDifficulty, assessZPD } from '../src/difficulty.mjs';
import { analyzeSessionBiases, updateBiasProfile, recommendBiasTraining } from '../src/biasTracker.mjs';
import { generateMorningReport, runWarRoom } from '../src/war-room.mjs';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {Map<string, object>} Active negotiation sessions */
const sessions = new Map();

/** Lazily initialized provider */
let _provider = null;
function getProvider() {
  if (!_provider) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    _provider = createAnthropicProvider({ apiKey });
  }
  return _provider;
}

/** Shared store for persistence */
const store = createStore();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}. It may have expired (sessions are in-memory only).`);
  return session;
}

function extractEmotions(session) {
  const emo = session._world?.emotions || {};
  return {
    confidence: emo.confidence ?? session.confidence ?? 0,
    frustration: emo.frustration ?? session.frustration ?? 0,
    fear: emo.fear ?? 0,
    openness: emo.openness ?? 0,
    egoThreat: emo.egoThreat ?? session.egoThreat ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'NegotiateAI',
  version: '0.1.0',
});

// ── Tool 1: negotiate_setup ─────────────────────────────────────────────────

server.tool(
  'negotiate_setup',
  'Set up a new negotiation session. Creates an AI adversary persona and initializes the negotiation. Returns a sessionId to use with negotiate_turn.',
  {
    situation: z.string().optional().describe('Context / setting of the negotiation'),
    userRole: z.string().optional().describe('Your role in the negotiation'),
    adversaryRole: z.string().optional().describe('The adversary\'s role'),
    objective: z.string().describe('Your main objective (required)'),
    minimalThreshold: z.string().describe('Minimum acceptable outcome (required)'),
    batna: z.string().describe('Best Alternative To Negotiated Agreement — your plan B (required)'),
    constraints: z.array(z.string()).optional().describe('List of constraints'),
    difficulty: z.enum(['cooperative', 'neutral', 'hostile', 'manipulative']).optional().describe('Adversary difficulty level (default: neutral)'),
    relationalStakes: z.string().optional().describe('Relational stakes — how important is the ongoing relationship'),
  },
  async (params) => {
    try {
      const provider = getProvider();
      const brief = buildBrief({
        situation: params.situation || '',
        userRole: params.userRole || '',
        adversaryRole: params.adversaryRole || '',
        objective: params.objective,
        minimalThreshold: params.minimalThreshold,
        batna: params.batna,
        constraints: params.constraints || [],
        difficulty: params.difficulty || 'neutral',
        relationalStakes: params.relationalStakes || '',
      });

      const adversary = await generatePersona(brief, provider);
      const session = createSession(brief, adversary, provider);
      const sessionId = randomUUID();
      sessions.set(sessionId, session);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            sessionId,
            adversaryIdentity: adversary.identity,
            adversaryStyle: adversary.style,
            maxTurns: session.maxTurns,
          }, null, 2),
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// ── Tool 2: negotiate_turn ──────────────────────────────────────────────────

server.tool(
  'negotiate_turn',
  'Send a message in an active negotiation session. Returns the adversary\'s response, emotional state, detected tactics, bias alerts, and coaching tips.',
  {
    sessionId: z.string().describe('Session ID from negotiate_setup'),
    message: z.string().describe('Your negotiation message to the adversary'),
  },
  async ({ sessionId, message }) => {
    try {
      const session = getSession(sessionId);

      if (session.status !== 'active') {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `Session is no longer active (status: ${session.status})` }) }], isError: true };
      }

      const result = await processTurn(session, message);
      const emotions = extractEmotions(session);
      const trend = session._world ? getMomentumTrend(session._world.negotiation) : 'stable';

      // Compute deal quality from world state
      let dealQuality = null;
      if (session._world?.negotiation) {
        const neg = session._world.negotiation;
        dealQuality = neg.currentOffer != null ? Math.round(neg.currentOffer) : null;
      }

      const response = {
        adversaryResponse: result.adversaryResponse,
        emotions,
        momentum: session.momentum,
        momentumTrend: trend,
        dealQuality,
        userTechniques: (result.tactics?.user || []).map(t => ({ technique: t.technique, quality: Math.round((t.quality || 0) * 100) })),
        adversaryTactics: (result.tactics?.adversary || []).map(t => ({ principle: t.principle, target: t.target })),
        biasAlerts: (result.biasIndicators || []).map(b => ({ biasType: b.biasType, severity: Math.round((b.severity || 0) * 100), evidence: b.evidence })),
        coaching: result.coaching || null,
        sessionOver: result.sessionOver || false,
        endReason: result.endReason || null,
      };

      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// ── Tool 3: negotiate_feedback ──────────────────────────────────────────────

server.tool(
  'negotiate_feedback',
  'Get detailed feedback and scoring for a completed (or in-progress) negotiation session. Analyzes tactics, biases, and provides recommendations.',
  {
    sessionId: z.string().describe('Session ID from negotiate_setup'),
  },
  async ({ sessionId }) => {
    try {
      const session = getSession(sessionId);
      const provider = getProvider();
      const report = await analyzeFeedback(session, provider);

      // Save session to store for progression tracking
      await store.saveSession({
        id: sessionId,
        date: new Date().toISOString(),
        brief: session.brief,
        adversary: session.adversary,
        transcript: session.transcript,
        status: session.status,
        turns: session.turn,
        feedback: report,
        mode: 'mcp',
      });

      const response = {
        globalScore: report.globalScore,
        scores: report.scores,
        biasesDetected: report.biasesDetected || [],
        algorithmicBiases: report.algorithmicBiases || [],
        tacticalScore: report.tacticalScore || null,
        recommendations: report.recommendations || [],
        missedOpportunities: report.missedOpportunities || [],
      };

      // Attach last feedback to session for plan generation
      session._lastFeedback = report;

      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// ── Tool 4: negotiate_plan ──────────────────────────────────────────────────

server.tool(
  'negotiate_plan',
  'Generate an optimal negotiation strategy plan based on the session brief and feedback. Call negotiate_feedback first to ensure feedback data is available.',
  {
    sessionId: z.string().describe('Session ID from negotiate_setup'),
  },
  async ({ sessionId }) => {
    try {
      const session = getSession(sessionId);
      const provider = getProvider();
      const feedback = session._lastFeedback;

      if (!feedback) {
        return { content: [{ type: 'text', text: 'Error: No feedback available for this session. Call negotiate_feedback first.' }], isError: true };
      }

      const plan = await generatePlan(session.brief, feedback, provider);
      return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// ── Tool 5: negotiate_prepare ───────────────────────────────────────────────

server.tool(
  'negotiate_prepare',
  'Run a full preparation dossier: simulates 3 negotiation sessions (cooperative, neutral, hostile) with auto-generated responses, analyzes all 3, and returns a comprehensive preparation report with best strategy, key phrases, traps to avoid, and success estimation.',
  {
    situation: z.string().optional().describe('Context / setting'),
    userRole: z.string().optional().describe('Your role'),
    adversaryRole: z.string().optional().describe('Adversary role'),
    objective: z.string().describe('Your main objective'),
    minimalThreshold: z.string().describe('Minimum acceptable outcome'),
    batna: z.string().describe('Your BATNA / plan B'),
    difficulty: z.enum(['cooperative', 'neutral', 'hostile', 'manipulative']).optional().describe('Base difficulty (default: neutral)'),
  },
  async (params) => {
    try {
      const provider = getProvider();
      const difficulties = ['cooperative', 'neutral', 'hostile'];
      const results = [];

      for (const diff of difficulties) {
        const brief = buildBrief({
          situation: params.situation || '',
          userRole: params.userRole || '',
          adversaryRole: params.adversaryRole || '',
          objective: params.objective,
          minimalThreshold: params.minimalThreshold,
          batna: params.batna,
          constraints: [],
          difficulty: diff,
          relationalStakes: '',
        });

        const adversary = await generatePersona(brief, provider);
        const session = createSession(brief, adversary, provider);

        // Auto-play 4 turns with generated user messages
        for (let turn = 0; turn < 4 && session.status === 'active'; turn++) {
          const autoMsg = await provider.generateJson({
            system: `You are simulating a negotiation participant. Generate a realistic negotiation message as the user.
Return JSON: { "message": "your negotiation message" }`,
            prompt: `Negotiation context:
Situation: ${brief.situation}
Your role: ${brief.userRole}
Objective: ${brief.objective}
BATNA: ${brief.batna}
Adversary: ${adversary.identity} (${diff} difficulty)
Turn: ${turn + 1}/4
${session.transcript.length > 0 ? 'Recent exchange:\n' + session.transcript.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n') : 'This is the opening message.'}

Generate a realistic negotiation message. Be strategic but natural.`,
            schemaName: 'autoMessage',
          });

          await processTurn(session, autoMsg.message || 'I would like to discuss terms.');
        }

        const feedback = await analyzeFeedback(session, provider);
        results.push({ difficulty: diff, adversary, session, feedback });
      }

      // Synthesize preparation dossier
      const synthesis = await provider.generateJson({
        system: `You are an expert negotiation strategist. Based on 3 simulated negotiation sessions (cooperative, neutral, hostile), produce a comprehensive preparation dossier.

Return JSON with exactly these fields:
{
  "adversaryProfile": "Description of likely adversary behavior patterns across scenarios",
  "bestStrategy": "The optimal strategy recommendation",
  "phrasesClés": ["key phrases to use"],
  "piègesÀÉviter": ["traps to avoid"],
  "planOptimal": "Step-by-step optimal plan",
  "estimatedSuccessRate": "percentage as string like 75%"
}`,
        prompt: `Preparation analysis based on 3 simulations:

Objective: ${params.objective}
BATNA: ${params.batna}
Minimum threshold: ${params.minimalThreshold}

Cooperative simulation (score ${results[0].feedback.globalScore}/100):
- Adversary: ${results[0].adversary.identity}
- Biases detected: ${results[0].feedback.biasesDetected?.map(b => b.biasType).join(', ') || 'none'}
- Recommendations: ${results[0].feedback.recommendations?.join('; ') || 'none'}

Neutral simulation (score ${results[1].feedback.globalScore}/100):
- Adversary: ${results[1].adversary.identity}
- Biases detected: ${results[1].feedback.biasesDetected?.map(b => b.biasType).join(', ') || 'none'}
- Recommendations: ${results[1].feedback.recommendations?.join('; ') || 'none'}

Hostile simulation (score ${results[2].feedback.globalScore}/100):
- Adversary: ${results[2].adversary.identity}
- Biases detected: ${results[2].feedback.biasesDetected?.map(b => b.biasType).join(', ') || 'none'}
- Recommendations: ${results[2].feedback.recommendations?.join('; ') || 'none'}

Produce a preparation dossier in the user's language (French if the input is in French).`,
        schemaName: 'preparationDossier',
      });

      return { content: [{ type: 'text', text: JSON.stringify(synthesis, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// ── Tool 6: negotiate_war_room ──────────────────────────────────────────────

server.tool(
  'negotiate_war_room',
  'Run the Overnight War Room batch trainer using stored progression and return the aggregated report plus a morning summary.',
  {
    drillCount: z.number().int().min(1).max(200).optional().describe('Number of batch drills to run (default: 50)'),
  },
  async ({ drillCount }) => {
    try {
      const provider = getProvider();
      const result = await runWarRoom(store, provider, { drillCount: drillCount || 50 });
      const morningReport = await generateMorningReport(result, provider);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ result, morningReport }, null, 2),
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// ── Tool 7: negotiate_profile ───────────────────────────────────────────────

server.tool(
  'negotiate_profile',
  'View your negotiation profile and progression. Shows total sessions, streak, belts earned, bias profile, weak dimensions, zone of proximal development, and recent average score. Data is read from ~/.negotiate-ai/.',
  {},
  async () => {
    try {
      const prog = await store.loadProgression();
      const allSessions = await store.loadSessions();

      // Recompute belts and weaknesses from stored sessions
      const belts = allSessions.length > 0 ? evaluateBelts(allSessions) : {};
      const weakDims = allSessions.length > 0 ? identifyWeaknesses(allSessions) : [];

      // Compute ZPD if sessions exist
      let zpd = prog.zpd || null;
      if (allSessions.length >= 3) {
        const zpdResult = assessZPD(allSessions);
        zpd = zpdResult.zone;
      }

      // Recent average score
      const recentScores = allSessions.slice(0, 5).map(s => s.feedback?.globalScore).filter(s => s != null);
      const recentAvg = recentScores.length > 0 ? Math.round(recentScores.reduce((a, b) => a + b, 0) / recentScores.length) : null;

      // Bias training recommendation
      const biasRec = prog.biasProfile ? recommendBiasTraining(prog.biasProfile) : null;

      const profile = {
        totalSessions: prog.totalSessions || allSessions.length,
        streak: prog.currentStreak || 0,
        belts,
        biasProfile: prog.biasProfile || {},
        biasTrainingRecommendation: biasRec,
        weakDimensions: weakDims,
        zpd,
        recentAvgScore: recentAvg,
      };

      return { content: [{ type: 'text', text: JSON.stringify(profile, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is now listening on stdio — log to stderr to avoid polluting the MCP protocol
  console.error('NegotiateAI MCP server started (stdio transport)');
}

main().catch((err) => {
  console.error('Fatal error starting MCP server:', err);
  process.exit(1);
});
