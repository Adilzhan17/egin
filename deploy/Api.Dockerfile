FROM node:22-alpine
RUN apk add --no-cache ffmpeg qpdf
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @egin/api --frozen-lockfile
COPY apps/api/src apps/api/src
COPY apps/api/scripts apps/api/scripts
ENV NODE_ENV=production DATA_DIR=/data PORT=4936
WORKDIR /workspace/apps/api
CMD ["node", "src/server.mjs"]
