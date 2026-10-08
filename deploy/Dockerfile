FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mobile/package.json apps/mobile/package.json
RUN pnpm install --frozen-lockfile
COPY apps/mobile apps/mobile
RUN pnpm build

FROM nginx:alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/mobile/dist /usr/share/nginx/html
EXPOSE 4934
