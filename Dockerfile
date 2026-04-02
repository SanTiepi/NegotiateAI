# ============================================================================
# NegotiateAI — Dockerfile (production)
# Single Node.js process: API + static web files
# ============================================================================

FROM node:20-alpine

WORKDIR /app

# Install deps first (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy source + web assets
COPY src/ ./src/
COPY web/ ./web/
COPY scenarios/ ./scenarios/
COPY mcp/ ./mcp/
COPY package.json ./

# Data directory for sessions/progression persistence
RUN mkdir -p /data && chown node:node /data
ENV NEGOTIATE_AI_DATA_DIR=/data

# Run as non-root
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget -q --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "-e", "import('./src/web-app.mjs').then(async({startWebServer})=>{await startWebServer({port:3000,host:'0.0.0.0'})})"]
