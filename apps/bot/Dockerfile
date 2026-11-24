FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/bot/package.json apps/bot/
RUN if [ -f package-lock.json ]; then npm ci --workspace @pep/bot --workspace @pep/shared --include-workspace-root; else npm install --workspace @pep/bot --workspace @pep/shared --include-workspace-root; fi
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/bot apps/bot
RUN npm run build -w @pep/bot

FROM node:22-alpine AS run
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/bot/package.json apps/bot/
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --workspace @pep/bot --workspace @pep/shared --include-workspace-root; else npm install --omit=dev --workspace @pep/bot --workspace @pep/shared --include-workspace-root; fi && npm cache clean --force
COPY --from=build /app/apps/bot/dist apps/bot/dist
USER node
EXPOSE 3100
CMD ["node", "apps/bot/dist/main.js"]
