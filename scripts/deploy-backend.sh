#!/usr/bin/env bash
# Update only the existing backend service. Keep its database, network and other services.
set -euo pipefail

source_dir="${1:?Pass the uploaded backend source directory}"
revision="${RELEASE_SHA:?Missing release revision}"
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid release revision' >&2; exit 1; }
command -v python3 >/dev/null
docker compose version >/dev/null

container="${BACKEND_CONTAINER:-}"
if [ -z "$container" ]; then
  for candidate in egin-backend agriplan-backend; do
    if docker inspect "$candidate" >/dev/null 2>&1; then
      if [ -n "$container" ]; then
        echo 'Two backend stacks found; set the BACKEND_CONTAINER repository variable.' >&2
        exit 1
      fi
      container="$candidate"
    fi
  done
fi
[ -n "$container" ] || { echo 'Existing backend not found; set BACKEND_CONTAINER.' >&2; exit 1; }

label() { docker inspect --format "{{index .Config.Labels \"$1\"}}" "$container"; }
working_dir=$(label com.docker.compose.project.working_dir)
config_files=$(label com.docker.compose.project.config_files)
project=$(label com.docker.compose.project)
service=$(label com.docker.compose.service)
[[ "$working_dir" == /* && -d "$working_dir" && "$service" =~ ^[a-zA-Z0-9_-]+$ && -n "$project" ]] || {
  echo 'Backend must belong to an existing Docker Compose project.' >&2; exit 1;
}
env_file="${BACKEND_ENV_FILE:-}"
if [ -z "$env_file" ]; then
  if [ "$container" = egin-backend ] && [ -f /opt/egin/.env ]; then
    env_file=/opt/egin/.env
  else
    env_file="$working_dir/.env"
  fi
fi
[ -f "$env_file" ] || { echo 'Server environment file missing; set BACKEND_ENV_FILE.' >&2; exit 1; }

override="$working_dir/compose.backend-release.yml"
compose=(docker compose --project-directory "$working_dir" --project-name "$project" --env-file "$env_file")
IFS=',' read -r -a files <<< "$config_files"
base_count=0
for file in "${files[@]}"; do
  [ "$file" = "$override" ] && continue
  [[ "$file" == /* && -f "$file" ]] || { echo 'Existing Compose file not found.' >&2; exit 1; }
  compose+=(-f "$file")
  base_count=$((base_count + 1))
done
[ "$base_count" -gt 0 ] || { echo 'No base Compose configuration found.' >&2; exit 1; }

# Build before changing the environment or replacing the running container.
image="egin-backend:$revision"
docker build --label "org.opencontainers.image.revision=$revision" -t "$image" "$source_dir"

umask 077
backup=$(mktemp -d)
trap 'rm -rf "$backup"' EXIT
cp -p "$env_file" "$backup/env"
had_override=false
if [ -f "$override" ]; then cp -p "$override" "$backup/override"; had_override=true; fi

rollback() {
  local code=$?
  trap - ERR
  echo 'Backend deployment failed; restoring the previous configuration.' >&2
  cp -p "$backup/env" "$env_file"
  if [ "$had_override" = true ]; then
    cp -p "$backup/override" "$override"
    "${compose[@]}" -f "$override" up -d --no-deps --no-build "$service" || true
  else
    rm -f "$override"
    "${compose[@]}" up -d --no-deps --no-build "$service" || true
  fi
  exit "$code"
}
trap rollback ERR

# Preserve every existing setting. Only replace OPENAI_API_KEY when explicitly provided.
if [ -n "${DEPLOY_OPENAI_API_KEY:-}" ]; then
  python3 - "$env_file" <<'PY'
import os, sys, tempfile
from pathlib import Path
path = Path(sys.argv[1])
key = os.environ['DEPLOY_OPENAI_API_KEY'].strip()
if not key.startswith('sk-') or any(c.isspace() for c in key):
    raise SystemExit('OPENAI_API_KEY must be a single key without whitespace.')
lines = [line for line in path.read_text().splitlines() if not line.lstrip().startswith('OPENAI_API_KEY=')]
fd, name = tempfile.mkstemp(dir=path.parent, prefix='.env-release-')
try:
    with os.fdopen(fd, 'w') as stream:
        stream.write('\n'.join(lines) + '\nOPENAI_API_KEY=' + key + '\n')
    os.replace(name, path)
finally:
    if os.path.exists(name): os.unlink(name)
PY
fi

cat > "$override" <<EOF
services:
  $service:
    image: $image
    environment:
      OPENAI_API_KEY: \${OPENAI_API_KEY:-}
    labels:
      com.egin.revision: "$revision"
EOF

# Validate silently: compose config output would contain server secrets.
"${compose[@]}" -f "$override" config --quiet
"${compose[@]}" -f "$override" up -d --no-deps --no-build "$service"

healthy=false
for attempt in $(seq 1 30); do
  if docker exec "$container" node -e 'fetch("http://127.0.0.1:3284/health").then(async r => {const b=await r.json();process.exit(r.ok && b.status === "ok" ? 0 : 1)}).catch(()=>process.exit(1))' >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 2
done
[ "$healthy" = true ]
docker exec "$container" node -e 'fetch("http://127.0.0.1:3284/farm-plots/00000000-0000-4000-8000-000000000000/conditions").then(r=>process.exit(r.status===401?0:1)).catch(()=>process.exit(1))'
if [ -n "${DEPLOY_OPENAI_API_KEY:-}" ]; then
  docker exec "$container" node -e 'process.exit(process.env.OPENAI_API_KEY ? 0 : 1)'
fi
trap - ERR
printf 'Backend release %s deployed and health checked.\n' "$revision"
