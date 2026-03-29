// index.mjs — CLI entry point
// Flow: setup → conversation → feedback → plan
// Commands: /end, /restart, /retry, /quit

import * as readline from 'node:readline';
import { buildBrief } from './scenario.mjs';
import { generatePersona } from './persona.mjs';
import { createSession, processTurn } from './engine.mjs';
import { analyzeFeedback } from './analyzer.mjs';
import { generatePlan } from './planner.mjs';
import { createAnthropicProvider } from './provider.mjs';

throw new Error('Not implemented');
