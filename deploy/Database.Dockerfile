# Same PostgreSQL major and Debian base as the existing persistent volume.
# Rebuild the privilege-switch helper with a patched Go toolchain instead of
# keeping the upstream prebuilt Go 1.24.6 binary in the production image.
FROM golang:1.27.3-bookworm AS gosu-build
WORKDIR /src
RUN git init && git remote add origin https://github.com/tianon/gosu.git \
    && git fetch --depth 1 origin 6456aaa0f3c854d199d0f037f068eb97515b7513 \
    && git checkout --detach FETCH_HEAD \
    && CGO_ENABLED=0 go build -mod=readonly -trimpath -o /gosu .

FROM pgvector/pgvector:pg17
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
COPY --from=gosu-build /gosu /usr/local/bin/gosu
RUN gosu nobody true
