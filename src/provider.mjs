// provider.mjs — LLM abstraction layer
// Contract: generateJson({ system, prompt, schemaName, temperature }) → object

import Anthropic from '@anthropic-ai/sdk';

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
 * @returns {{ generateJson: (req: GenerateJsonRequest) => Promise<object> }}
 */
export function createAnthropicProvider({ apiKey, model = 'claude-sonnet-4-20250514' } = {}) {
  const client = new Anthropic({ apiKey });

  return {
    async generateJson({ system, prompt, schemaName, temperature = 0.7 }) {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        temperature,
        system,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');

      // Extract JSON from response (handles ```json ... ``` blocks or raw JSON)
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
      if (!jsonMatch) {
        throw new Error(`Provider: no JSON found in response for schema "${schemaName}"`);
      }
      return JSON.parse(jsonMatch[1]);
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
