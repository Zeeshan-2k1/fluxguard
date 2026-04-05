# Builds the FluxGuard Express example for benchmark docker-compose (build context: repository root).
FROM node:20-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY examples ./examples
RUN pnpm install --frozen-lockfile
RUN pnpm --filter fluxguard run build
WORKDIR /app/examples/express-app
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
