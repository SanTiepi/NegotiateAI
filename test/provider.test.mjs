import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMockProvider, createAnthropicProvider } from '../src/provider.mjs';

describe('provider', () => {
  describe('createMockProvider', () => {
    it('returns a provider with a generateJson method', () => {
      const provider = createMockProvider();
      assert.equal(typeof provider.generateJson, 'function');
    });

    it('returns fixture data matching schemaName', async () => {
      const fixture = { name: 'Test Adversary', style: 'hostile' };
      const provider = createMockProvider({ adversary: fixture });
      const result = await provider.generateJson({
        system: 'test',
        prompt: 'test',
        schemaName: 'adversary',
        temperature: 0.5,
      });
      assert.deepEqual(result, fixture);
    });

    it('supports function fixtures for dynamic responses', async () => {
      const provider = createMockProvider({
        turn: (req) => ({ response: `Echo: ${req.prompt}` }),
      });
      const result = await provider.generateJson({
        system: 'sys',
        prompt: 'hello',
        schemaName: 'turn',
      });
      assert.equal(result.response, 'Echo: hello');
    });

    it('throws on unknown schemaName when no default fixture', async () => {
      const provider = createMockProvider({});
      await assert.rejects(
        () => provider.generateJson({ system: '', prompt: '', schemaName: 'unknown' }),
        { message: /unknown/i }
      );
    });
  });

  describe('createAnthropicProvider', () => {
    it('returns a provider with a generateJson method', () => {
      const provider = createAnthropicProvider({ apiKey: 'test-key' });
      assert.equal(typeof provider.generateJson, 'function');
    });
  });
});
