// mcp-hardening.mjs — helpers to keep the MCP server bounded and predictable

function nowMs() {
  return Date.now();
}

export function createSessionRegistry({ maxSessions = 100, ttlMs = 1000 * 60 * 60 * 6 } = {}) {
  const sessions = new Map();

  function purgeExpired(now = nowMs()) {
    for (const [id, entry] of sessions.entries()) {
      if (entry.expiresAt <= now) sessions.delete(id);
    }
  }

  function set(id, session, now = nowMs()) {
    purgeExpired(now);
    if (sessions.size >= maxSessions) {
      const oldest = sessions.entries().next().value;
      if (oldest) sessions.delete(oldest[0]);
    }
    sessions.set(id, {
      session,
      createdAt: now,
      touchedAt: now,
      expiresAt: now + ttlMs,
    });
  }

  function get(id, now = nowMs()) {
    purgeExpired(now);
    const entry = sessions.get(id);
    if (!entry) return null;
    entry.touchedAt = now;
    entry.expiresAt = now + ttlMs;
    return entry.session;
  }

  function size(now = nowMs()) {
    purgeExpired(now);
    return sessions.size;
  }

  return { set, get, size, purgeExpired };
}

export function sanitizeDrillCount(value, fallback = 50, max = 200) {
  const numeric = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(1, Math.min(max, numeric));
}

export function formatMcpError(err, code = 'internal_error') {
  const message = err instanceof Error ? err.message : String(err || 'Unknown error');
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ error: message, code }, null, 2),
    }],
    isError: true,
  };
}
