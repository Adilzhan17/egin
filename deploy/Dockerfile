FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/developers/package.json apps/developers/package.json
RUN pnpm install --frozen-lockfile
COPY apps/mobile apps/mobile
COPY apps/developers apps/developers
COPY apps/api/src/catalog.json apps/api/src/catalog.json
RUN pnpm build

FROM nginx:alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/mobile/dist /usr/share/nginx/html
COPY --from=build /workspace/apps/developers/dist /usr/share/nginx/portal
EXPOSE 4934 4938
