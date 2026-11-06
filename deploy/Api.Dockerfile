FROM node:22-alpine AS soilcore-build
RUN apk add --no-cache cmake g++ make
WORKDIR /build
COPY firmware/soilcore/ ./
RUN cmake -S . -B build && cmake --build build --parallel && ctest --test-dir build --output-on-failure

FROM node:22-alpine
LABEL com.egin.api.demo-isolation="1"
LABEL com.egin.api.presence-privacy="1"
LABEL com.egin.api.auth-security="1"
RUN apk add --no-cache ffmpeg qpdf libstdc++
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @egin/api --frozen-lockfile
COPY apps/api/src apps/api/src
COPY apps/api/scripts apps/api/scripts
COPY --from=soilcore-build /build/build/soilcore_cli /usr/local/bin/soilcore_cli
ENV NODE_ENV=production DATA_DIR=/data PORT=4936 SOILCORE_CLI=/usr/local/bin/soilcore_cli
WORKDIR /workspace/apps/api
CMD ["node", "src/server.mjs"]
