// provider.mjs — LLM abstraction layer
// Contract: generateJson({ system, prompt, schemaName, temperature }) → object

import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * @typedef {object} GenerateJsonRequest
 * @property {string} system - System prompt
 * @property {string} prompt - User prompt
 * @property {string} schemaName - Name hint for the expected output schema
 * @property {number} [temperature=0.7] - Sampling temperature
 */

/**
 * @param {object} options
 * @param {string} options.apiKey
 * @param {string} [options.model='claude-sonnet-4-20250514']
 * @param {number} [options.timeoutMs=60000]
 * @returns {{ generateJson: (req: GenerateJsonRequest) => Promise<object> }}
 */
export function createAnthropicProvider({ apiKey, model = process.env.NEGOTIATE_AI_MODEL || 'claude-haiku-4-5-20251001', timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const client = new Anthropic({ apiKey });

  return {
    async generateJson({ system, prompt, schemaName, temperature = 0.7 }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response;
      try {
        response = await client.messages.create(
          {
            model,
            max_tokens: 4096,
            temperature,
            system,
            messages: [{ role: 'user', content: prompt }],
          },
          { signal: controller.signal },
        );
      } catch (err) {
        if (err.name === 'AbortError') {
          throw new Error(`Provider: timeout after ${timeoutMs}ms for schema "${schemaName}"`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }

      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');

      // Extract JSON from response (handles ```json ... ``` blocks or raw JSON)
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
      if (!jsonMatch) {
        throw new Error(`Provider: no JSON found in response for schema "${schemaName}"`);
      }

      try {
        return JSON.parse(jsonMatch[1]);
      } catch (parseErr) {
        throw new Error(`Provider: malformed JSON for schema "${schemaName}": ${parseErr.message}`);
      }
    },
  };
}

/**
 * @param {Record<string, object | ((req: GenerateJsonRequest) => object)>} fixtures
 * @returns {{ generateJson: (req: GenerateJsonRequest) => Promise<object> }}
 */
export function createMockProvider(fixtures = {}) {
  return {
    async generateJson(req) {
      const fixture = fixtures[req.schemaName];
      if (fixture === undefined) {
        throw new Error(`MockProvider: no fixture for schema "${req.schemaName}"`);
      }
      if (typeof fixture === 'function') {
        return fixture(req);
      }
      return structuredClone(fixture);
    },
  };
}
