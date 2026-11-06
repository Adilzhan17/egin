FROM node:22-alpine AS soilcore-build
RUN apk add --no-cache cmake g++ make
WORKDIR /build
COPY firmware/soilcore/ ./
RUN cmake -S . -B build && cmake --build build --parallel && ctest --test-dir build --output-on-failure

FROM node:22-alpine AS dependencies
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @egin/api --prod --frozen-lockfile

FROM node:22-alpine
LABEL com.egin.api.demo-isolation="1"
LABEL com.egin.api.presence-privacy="1"
LABEL com.egin.api.auth-security="1"
LABEL com.egin.api.postgres-runtime="1"
RUN apk add --no-cache ffmpeg qpdf libstdc++
# Package managers belong to the build stage, not the running API. In
# particular, bundled npm/pnpm dependencies had findings outside pnpm audit.
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /workspace
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=dependencies /workspace/apps/api/node_modules ./apps/api/node_modules
COPY apps/api/package.json apps/api/package.json
COPY apps/api/src apps/api/src
COPY apps/api/scripts apps/api/scripts
COPY --from=soilcore-build /build/build/soilcore_cli /usr/local/bin/soilcore_cli
ENV NODE_ENV=production DATA_DIR=/data PORT=4936 SOILCORE_CLI=/usr/local/bin/soilcore_cli
WORKDIR /workspace/apps/api
CMD ["node", "src/server.mjs"]
