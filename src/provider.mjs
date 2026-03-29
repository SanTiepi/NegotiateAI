// provider.mjs — LLM abstraction layer
// Contract: generateJson({ system, prompt, schemaName, temperature }) → object

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
  throw new Error('Not implemented');
}

/**
 * @param {Record<string, object | ((req: GenerateJsonRequest) => object)>} fixtures
 * @returns {{ generateJson: (req: GenerateJsonRequest) => Promise<object> }}
 */
export function createMockProvider(fixtures = {}) {
  throw new Error('Not implemented');
}
