#!/usr/bin/env python3
"""Website-only deployment: healthy blue/green slots behind a permanent Nginx.

Adopts the existing gateway without restarting it. Production and staging have
separate volumes and origins. SQLite schema changes must remain backward compatible.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / 'deploy/state'
GATEWAY = os.environ.get('EGIN_GATEWAY', 'egin-mobile-web-1')
HOSTS = {'production': 'egin.perricheno.com', 'staging': 'dev-egin.perricheno.com'}
VOLUMES = {'production': 'egin-mobile_egin-data', 'staging': 'egin-staging-data'}


def run(*args, capture=False, env=None):
    result = subprocess.run(args, cwd=ROOT, env=env, check=True, text=True,
                            stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else ''


def healthy(container):
    return run('docker', 'inspect', '--format', '{{.State.Health.Status}}', container, capture=True) == 'healthy'


def server(environment, slot):
    name = f"egin-{environment}-{slot['slot']}-web-1"
    headers = 'proxy_set_header Host $host; proxy_set_header X-Real-IP $http_cf_connecting_ip; proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;'
    return f'''
server {{
  listen 4934;
  server_name {HOSTS[environment]};
  server_tokens off;
  client_max_body_size 9m;
  add_header X-EGIN-Release "{slot['release']}" always;
  add_header X-EGIN-Environment "{environment}" always;
  {'add_header X-Robots-Tag "noindex, nofollow" always;' if environment == 'staging' else ''}
  location /assets/ {{
    root /usr/share/nginx/html;
    try_files $uri @application;
    expires 1y;
    add_header Cache-Control "public, immutable";
  }}
  location @application {{ proxy_pass http://{name}:4934; {headers} }}
  location / {{ proxy_pass http://{name}:4934; {headers} proxy_read_timeout 35s; }}
}}
'''


def render(state):
    # Unknown hosts never fall through into another environment.
    return 'server { listen 4934 default_server; server_name _; location = /health { return 200 \"ok\"; } location / { return 404; } }\n' + ''.join(server(env, value['active']) for env, value in state.items())


def switch(state):
    conf = STATE / 'gateway.next.conf'
    conf.write_text(render(state))
    previous = run('docker', 'exec', GATEWAY, 'cat', '/etc/nginx/conf.d/default.conf', capture=True)
    try:
        run('docker', 'cp', str(conf), f'{GATEWAY}:/etc/nginx/conf.d/default.conf')
        run('docker', 'exec', GATEWAY, 'nginx', '-t')
        run('docker', 'exec', GATEWAY, 'nginx', '-s', 'reload')
        # Check traffic after reload, not just container health. Retry during worker handoff.
        for environment, value in state.items():
            for attempt in range(30):
                try:
                    request = urllib.request.Request('http://127.0.0.1:4934/api/health', headers={'Host': HOSTS[environment]})
                    with urllib.request.urlopen(request, timeout=3) as response:
                        assert response.headers.get('X-EGIN-Release') == value['active']['release']
                        assert json.load(response)['ok'] is True
                    request = urllib.request.Request('http://127.0.0.1:4934/api/session', headers={'Host': HOSTS[environment]})
                    with urllib.request.urlopen(request, timeout=3) as response:
                        session = json.load(response)
                        assert session['rpID'] == HOSTS[environment]
                        assert session['origin'] == 'https://' + HOSTS[environment]
                    break
                except Exception:
                    if attempt == 29:
                        raise
                    time.sleep(.2)
    except Exception:
        conf.write_text(previous)
        run('docker', 'cp', str(conf), f'{GATEWAY}:/etc/nginx/conf.d/default.conf')
        run('docker', 'exec', GATEWAY, 'nginx', '-s', 'reload')
        raise
    temporary = STATE / 'deployments.next.json'
    temporary.write_text(json.dumps(state, indent=2) + '\n')
    temporary.replace(STATE / 'deployments.json')
    (STATE / 'gateway.conf').write_text(render(state))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['deploy', 'rollback', 'status'])
    parser.add_argument('environment', choices=HOSTS, nargs='?', default='staging')
    parser.add_argument('--reuse-images', help='Reuse a tested web/API image tag from a previous deployment')
    args = parser.parse_args()
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (STATE / 'lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        path = STATE / 'deployments.json'
        state = json.loads(path.read_text()) if path.exists() else {}
        if args.action == 'status':
            print(json.dumps(state, indent=2)); return
        current = state.get(args.environment, {})
        if args.action == 'rollback':
            previous = current.get('previous')
            if not previous:
                raise SystemExit('No previous healthy slot to roll back to.')
            for service in ['web', 'api']:
                container = f"egin-{args.environment}-{previous['slot']}-{service}-1"
                expected_image = f"egin-{service}:{previous['release']}"
                if not healthy(container) or run('docker', 'inspect', '--format', '{{.Config.Image}}', container, capture=True) != expected_image:
                    raise SystemExit('Previous slot is not healthy; no traffic changed.')
                if service == 'api':
                    settings = json.loads(run('docker', 'inspect', '--format', '{{json .Config.Env}}', container, capture=True))
                    if f'RP_ID={HOSTS[args.environment]}' not in settings or f'APP_ORIGINS=https://{HOSTS[args.environment]}' not in settings:
                        raise SystemExit('Previous slot belongs to another domain; no traffic changed.')
            state[args.environment] = {'active': previous, 'previous': current['active']}
            switch(state); print('Rollback complete.'); return
        if not state and args.environment != 'production':
            raise SystemExit('Adopt the production gateway first: deploy/manage.py deploy production')
        if not healthy(GATEWAY):
            raise SystemExit('Permanent gateway must be running and healthy; no traffic changed.')
        networks = json.loads(run('docker', 'inspect', '--format', '{{json .NetworkSettings.Networks}}', GATEWAY, capture=True))
        run('docker', 'network', 'create', 'egin-edge') if 'egin-edge' not in run('docker', 'network', 'ls', '--format', '{{.Name}}', capture=True).splitlines() else None
        if 'egin-edge' not in networks:
            run('docker', 'network', 'connect', 'egin-edge', GATEWAY)
        run('docker', 'volume', 'create', VOLUMES[args.environment])
        slot = 'green' if current.get('active', {}).get('slot') == 'blue' else 'blue'
        release = args.reuse_images or run('git', 'rev-parse', '--short', 'HEAD', capture=True) + '-' + time.strftime('%Y%m%d%H%M%S', time.gmtime())
        if not all(c.isalnum() or c in '.-_' for c in release):
            raise SystemExit('Invalid image tag')
        images = {kind: f'egin-{kind}:{release}' for kind in ['web', 'api']}
        if not args.reuse_images:
            for kind, dockerfile in [('api', 'deploy/Api.Dockerfile'), ('web', 'deploy/Dockerfile')]:
                run('docker', 'build', '-f', dockerfile, '-t', images[kind], '.')
        # SQLite online backup is consistent while the active API keeps serving writes.
        backup_code = "const fs=require('node:fs');if(fs.existsSync('/data/egin.sqlite')){const {DatabaseSync}=require('node:sqlite');fs.mkdirSync('/data/backups',{recursive:true,mode:0o700});const db=new DatabaseSync('/data/egin.sqlite');db.exec('PRAGMA busy_timeout=5000');db.exec(\"VACUUM INTO '/data/backups/\"+Date.now()+\".sqlite'\");db.close();}"
        run('docker', 'run', '--rm', '-v', VOLUMES[args.environment] + ':/data', images['api'], 'node', '-e', backup_code)
        env = {**os.environ, 'EGIN_WEB_IMAGE': images['web'], 'EGIN_API_IMAGE': images['api'],
               'EGIN_ORIGIN': 'https://' + HOSTS[args.environment], 'EGIN_RP_ID': HOSTS[args.environment], 'EGIN_DATA_VOLUME': VOLUMES[args.environment]}
        project = f'egin-{args.environment}-{slot}'
        run('docker', 'compose', '-p', project, '-f', 'deploy/slot.yml', 'up', '-d', '--wait', '--wait-timeout', '100', env=env)
        for service in ['web', 'api']:
            if not healthy(f'{project}-{service}-1'):
                raise SystemExit('Candidate unhealthy; no traffic changed.')
        # Preserve hashed assets for clients with an older page/service worker.
        with tempfile.TemporaryDirectory(prefix='egin-assets-') as temporary:
            run('docker', 'cp', f'{project}-web-1:/usr/share/nginx/html/assets', temporary)
            run('docker', 'cp', str(Path(temporary) / 'assets') + '/.', f'{GATEWAY}:/usr/share/nginx/html/assets/')
        candidate = {'slot': slot, 'release': release}
        state[args.environment] = {'active': candidate, **({'previous': current['active']} if current else {})}
        switch(state)
        print(f"{args.environment}: {release} active in {slot}; previous slot remains running.")


if __name__ == '__main__':
    main()
