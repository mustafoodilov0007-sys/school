# Build kontekst: repozitoriya ildizi  (docker compose --profile full up -d --build)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN if [ -f package-lock.json ]; then npm ci --workspace @pep/api --workspace @pep/shared --include-workspace-root; else npm install --workspace @pep/api --workspace @pep/shared --include-workspace-root; fi
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @pep/api

FROM node:22-alpine AS run
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --workspace @pep/api --workspace @pep/shared --include-workspace-root; else npm install --omit=dev --workspace @pep/api --workspace @pep/shared --include-workspace-root; fi && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY db/migrations db/migrations
ENV MIGRATIONS_DIR=/app/db/migrations
USER node
EXPOSE 3000
# Avval migratsiya (advisory lock bilan xavfsiz), keyin server
CMD ["sh", "-c", "node apps/api/dist/migrate.js && node apps/api/dist/server.js"]
