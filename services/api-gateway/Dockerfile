FROM node:24-alpine

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace manifest files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/api-gateway/package.json ./services/api-gateway/

# Install only api-gateway dependencies
RUN pnpm install --frozen-lockfile --filter @pulseward/api-gateway

# Copy source
COPY services/api-gateway/ ./services/api-gateway/

# Data directory for SQLite
RUN mkdir -p /data
ENV DB_PATH=/data/pulseward.db

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:8787/health || exit 1

CMD ["node", "--no-warnings", "services/api-gateway/src"]
