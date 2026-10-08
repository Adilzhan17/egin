FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY .vendor/web /vendor
RUN mkdir -p /root/.local/share/pnpm/store && if [ -f /vendor/web-store.tar.gz ]; then tar -xzf /vendor/web-store.tar.gz -C /root/.local/share/pnpm/store; fi && pnpm install --frozen-lockfile --filter @egin/web && rm -rf /vendor /root/.local/share/pnpm/store
COPY apps/web apps/web
ENV API_URL=http://core:8000 NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @egin/web build

FROM node:22-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 API_URL=http://core:8000 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /workspace/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
