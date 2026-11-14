# Lucky wheel for a VPS: Node + SQLite. Used by docker-compose.yml (with Caddy for HTTPS).

# ---- build: type-check, test and build the website ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm test

# ---- run: only what the server needs ----
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/app/data/luckywheel.db \
    BACKUP_DIR=/app/backups
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY worker ./worker
COPY migrations ./migrations
COPY src/lib/rules.ts src/lib/wheel.ts ./src/lib/
COPY src/config ./src/config
COPY src/types.ts ./src/types.ts
RUN mkdir -p data backups && chown -R node:node /app
USER node
EXPOSE 3000
VOLUME ["/app/data", "/app/backups"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/wheel >/dev/null || exit 1
CMD ["node", "server/index.ts"]
