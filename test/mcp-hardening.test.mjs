import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionRegistry, sanitizeDrillCount, formatMcpError } from '../src/mcp-hardening.mjs';

describe('mcp-hardening', () => {
  it('evicts oldest session when registry reaches max size', () => {
    const registry = createSessionRegistry({ maxSessions: 2, ttlMs: 1000 });
    registry.set('a', { id: 'a' }, 0);
    registry.set('b', { id: 'b' }, 1);
    registry.set('c', { id: 'c' }, 2);

    assert.equal(registry.get('a', 2), null);
    assert.deepEqual(registry.get('b', 2), { id: 'b' });
    assert.deepEqual(registry.get('c', 2), { id: 'c' });
  });

  it('expires sessions after TTL', () => {
    const registry = createSessionRegistry({ maxSessions: 2, ttlMs: 10 });
    registry.set('x', { ok: true }, 0);
    assert.deepEqual(registry.get('x', 5), { ok: true });
    assert.equal(registry.get('x', 16), null);
  });

  it('sanitizes drill counts into MCP-safe bounds', () => {
    assert.equal(sanitizeDrillCount(undefined), 50);
    assert.equal(sanitizeDrillCount(999), 200);
    assert.equal(sanitizeDrillCount(-4), 1);
    assert.equal(sanitizeDrillCount(12.8), 12);
  });

  it('formats structured MCP errors', () => {
    const response = formatMcpError(new Error('boom'), 'turn_failed');
    assert.equal(response.isError, true);
    const payload = JSON.parse(response.content[0].text);
    assert.equal(payload.error, 'boom');
    assert.equal(payload.code, 'turn_failed');
  });
});
