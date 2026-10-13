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
from health_reporter import DeployReporter
from market_infrastructure import prepare_market

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / 'deploy/state'
GATEWAY = os.environ.get('EGIN_GATEWAY', 'egin-mobile-web-1')
HOSTS = {'production': 'egin.perricheno.com', 'staging': 'dev-egin.perricheno.com'}
PORTAL_HOSTS = {'production': 'api-egin.perricheno.com', 'staging': 'dev-api-egin.perricheno.com'}
VOLUMES = {'production': 'egin-mobile_egin-data', 'staging': 'egin-staging-data'}
REPORTER = None
DEMO_ISOLATION_LABEL = 'com.egin.api.demo-isolation'
# This schema is a compatibility boundary, even before its first scenario:
# once installed, the active API may create private synthetic users at any time.
DEMO_ISOLATION_CHECK = r'''
import pg from 'pg';
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
let client,db;
try {
  if(!process.env.MARKET_DATABASE_URL)throw Error('database not configured');
  client=new pg.Client({connectionString:process.env.MARKET_DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:5000});
  await client.connect();
  const schema=!!(await client.query("SELECT to_regclass('platform_demo_scenarios') AS relation")).rows[0].relation;
  const scenarios=schema?Number((await client.query('SELECT count(*)::text AS n FROM platform_demo_scenarios')).rows[0].n):0;
  const path=resolve(process.env.DATA_DIR||'./data','egin.sqlite');
  if(!existsSync(path))throw Error('identity store unavailable');
  db=new DatabaseSync(path,{readOnly:true});db.exec('PRAGMA busy_timeout=5000');
  const identities=Number(db.prepare("SELECT count(*) AS n FROM users WHERE id GLOB 'demo:*'").get().n);
  process.stdout.write(JSON.stringify({schema,scenarios,identities}));
} catch {
  // Never print a connection string, SQL error, environment or user record.
  process.exitCode=1;
} finally {
  try{db?.close();}catch{}
  try{await client?.end();}catch{}
}
'''


def guard_capture(*args):
    """Keep infrastructure diagnostics (potentially containing credentials) private."""
    try:
        return subprocess.run(args, cwd=ROOT, check=True, text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              timeout=20).stdout.strip()
    except (subprocess.SubprocessError, OSError):
        raise SystemExit('Demo isolation compatibility could not be verified; no traffic changed.') from None


def require_demo_compatibility(environment, target_image, active, target_container=None):
    """Do not expose private demo data through an API predating its isolation."""
    # A retained slot can reference a retagged image. Inspect the immutable image
    # actually running there, not only its human-readable Config.Image tag.
    image = guard_capture('docker', 'inspect', '--format', '{{.Image}}', target_container) if target_container else target_image
    try:
        labels = json.loads(guard_capture('docker', 'image', 'inspect', '--format', '{{json .Config.Labels}}', image)) or {}
        if not isinstance(labels, dict):
            raise ValueError('invalid labels')
    except (ValueError, TypeError):
        raise SystemExit('API image capabilities could not be verified; no traffic changed.') from None
    if labels.get(DEMO_ISOLATION_LABEL) == '1':
        return
    if not active or active.get('slot') not in ('blue', 'green'):
        raise SystemExit('Cannot verify demo isolation without an active API; use a compatible API image. No traffic changed.')
    container = f"egin-{environment}-{active['slot']}-api-1"
    try:
        result = json.loads(guard_capture('docker', 'exec', '--workdir', '/workspace/apps/api', container,
                                         'node', '--input-type=module', '-e', DEMO_ISOLATION_CHECK))
        if (not isinstance(result, dict) or type(result.get('schema')) is not bool
                or any(type(result.get(key)) is not int or result[key] < 0 for key in ('scenarios', 'identities'))):
            raise ValueError('invalid compatibility result')
    except (ValueError, TypeError):
        raise SystemExit('Demo database compatibility could not be verified; no traffic changed.') from None
    if result['schema'] or result['scenarios'] or result['identities']:
        raise SystemExit('This API image lacks demo isolation. The demo migration or synthetic identities already exist; '
                         'deploy or roll back to an image with com.egin.api.demo-isolation=1. No traffic changed.')


def run(*args, capture=False, env=None):
    if REPORTER and REPORTER.enabled and not capture:
        process = subprocess.Popen(args, cwd=ROOT, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=1)
        try:
            for line in process.stdout:
                print(line, end='', flush=True)
                REPORTER.observe_line(line)
            code = process.wait()
            if code:
                raise subprocess.CalledProcessError(code, args)
        except BaseException:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill(); process.wait()
            raise
        return ''
    result = subprocess.run(args, cwd=ROOT, env=env, check=True, text=True,
                            stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else ''


def healthy(container):
    return run('docker', 'inspect', '--format', '{{.State.Health.Status}}', container, capture=True) == 'healthy'


def server(environment, slot, portal=False):
    name = f"egin-{environment}-{slot['slot']}-web-1"
    headers = 'proxy_set_header Host $host; proxy_set_header X-Real-IP $http_cf_connecting_ip; proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;'
    host = PORTAL_HOSTS[environment] if portal else HOSTS[environment]
    port = 4938 if portal else 4934
    assets = 'developer-assets' if portal else 'assets'
    return f'''
server {{
  listen 4934;
  server_name {host};
  server_tokens off;
  client_max_body_size 9m;
  add_header X-EGIN-Release "{slot['release']}" always;
  add_header X-EGIN-Environment "{environment}" always;
  {'add_header X-Robots-Tag "noindex, nofollow" always;' if environment == 'staging' else ''}
  location /{assets}/ {{
    root /usr/share/nginx/html;
    try_files $uri @application;
    expires 1y;
    add_header Cache-Control "public, immutable";
  }}
  location @application {{ proxy_pass http://{name}:{port}; {headers} }}
  location / {{ proxy_pass http://{name}:{port}; {headers} proxy_read_timeout 130s; }}
  location /api/market/ {{ client_max_body_size 11m; proxy_pass http://{name}:{port}; {headers} proxy_read_timeout 130s; }}
  location /api/trade/ {{ client_max_body_size 16m; proxy_pass http://{name}:{port}; {headers} proxy_read_timeout 130s; }}
  location /api/platform/ {{ client_max_body_size 16m; proxy_pass http://{name}:{port}; {headers} proxy_read_timeout 130s; }}
  location /api/chat/ {{ client_max_body_size 16m; proxy_pass http://{name}:{port}; {headers} proxy_buffering off; proxy_cache off; proxy_read_timeout 130s; }}
}}
'''


def render(state):
    # Unknown hosts never fall through into another environment.
    return 'server { listen 4934 default_server; server_name _; location = /health { return 200 \"ok\"; } location / { return 404; } }\n' + ''.join(server(env, value['active']) + (server(env, value['active'], True) if value['active'].get('portal') else '') for env, value in state.items())


def switch(state):
    saved_state = STATE / 'deployments.json'
    previous_state = json.loads(saved_state.read_text()) if saved_state.exists() else None
    conf = STATE / 'gateway.next.conf'
    conf.write_text(render(state))
    previous = run('docker', 'exec', GATEWAY, 'cat', '/etc/nginx/conf.d/default.conf', capture=True)
    try:
        run('docker', 'cp', str(conf), f'{GATEWAY}:/etc/nginx/conf.d/default.conf')
        run('docker', 'exec', GATEWAY, 'nginx', '-t')
        run('docker', 'exec', GATEWAY, 'nginx', '-s', 'reload')
        if REPORTER:
            REPORTER.stage('verify')
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
                    if value['active'].get('portal'):
                        request = urllib.request.Request('http://127.0.0.1:4934/api/developer/session', headers={'Host': PORTAL_HOSTS[environment]})
                        with urllib.request.urlopen(request, timeout=3) as response:
                            portal = json.load(response)
                            assert portal['origin'] == 'https://' + PORTAL_HOSTS[environment]
                            assert portal['app_origin'] == 'https://' + HOSTS[environment]
                        request = urllib.request.Request('http://127.0.0.1:4934/openapi.json', headers={'Host': PORTAL_HOSTS[environment]})
                        with urllib.request.urlopen(request, timeout=3) as response:
                            assert json.load(response)['openapi'] == '3.1.0'
                    break
                except Exception:
                    if REPORTER and attempt % 5 == 0:
                        REPORTER.emit('log', code='health_retry')
                    if attempt == 29:
                        raise
                    time.sleep(.2)
    except Exception:
        # Automatic recovery obeys the same isolation boundary as `rollback`.
        # A candidate can install the demo schema before its HTTP verification
        # fails; restoring an old API at that point is not a safe recovery.
        if previous_state is None:
            raise SystemExit('Automatic rollback cannot verify the previous API image; '
                             'previous traffic was not restored. Deploy a compatible API image.') from None
        for environment, value in previous_state.items():
            target = value['active']
            if target == state.get(environment, {}).get('active'):
                continue
            try:
                require_demo_compatibility(environment, f"egin-api:{target['release']}",
                                           state.get(environment, {}).get('active'),
                                           f"egin-{environment}-{target['slot']}-api-1")
            except SystemExit:
                raise SystemExit('Automatic rollback blocked by the demo isolation compatibility guard; '
                                 'previous traffic was not restored. Deploy a compatible API image.') from None
        conf.write_text(previous)
        run('docker', 'cp', str(conf), f'{GATEWAY}:/etc/nginx/conf.d/default.conf')
        run('docker', 'exec', GATEWAY, 'nginx', '-s', 'reload')
        if REPORTER:
            REPORTER.emit('log', code='rollback_restored')
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
    global REPORTER
    REPORTER = DeployReporter(args.action, args.environment, args.reuse_images)
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (STATE / 'lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        with REPORTER:
            execute(args)


def execute(args):
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
                if previous.get('portal') and f'PORTAL_ORIGIN=https://{PORTAL_HOSTS[args.environment]}' not in settings:
                    raise SystemExit('Previous portal belongs to another domain; no traffic changed.')
        require_demo_compatibility(args.environment, f"egin-api:{previous['release']}", current.get('active'),
                                   f"egin-{args.environment}-{previous['slot']}-api-1")
        state[args.environment] = {'active': previous, 'previous': current['active']}
        REPORTER.stage('switch')
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
            REPORTER.stage('build_' + kind)
            run('docker', 'build', '-f', dockerfile, '-t', images[kind], '.')
        run('docker', 'build', '-f', 'deploy/MarketInference.Dockerfile', '-t', f'egin-market-inference:{release}', '.')
    else:
        REPORTER.emit('log', code='image_reused')
    # Reject an incompatible reused image before starting its API against data.
    require_demo_compatibility(args.environment, images['api'], current.get('active'))
    REPORTER.stage('backup')
    # SQLite online backup is consistent while the active API keeps serving writes.
    backup_code = "const fs=require('node:fs');if(fs.existsSync('/data/egin.sqlite')){const {DatabaseSync}=require('node:sqlite');fs.mkdirSync('/data/backups',{recursive:true,mode:0o700});const db=new DatabaseSync('/data/egin.sqlite');db.exec('PRAGMA busy_timeout=5000');db.exec(\"VACUUM INTO '/data/backups/\"+Date.now()+\".sqlite'\");db.close();if(fs.existsSync('/data/one-c.key')){fs.copyFileSync('/data/one-c.key','/data/backups/one-c.key');fs.chmodSync('/data/backups/one-c.key',0o600);}}"
    run('docker', 'run', '--rm', '-v', VOLUMES[args.environment] + ':/data', images['api'], 'node', '-e', backup_code)
    market_env = prepare_market(args.environment, release)
    env = {**os.environ, **market_env, 'EGIN_WEB_IMAGE': images['web'], 'EGIN_API_IMAGE': images['api'],
           'EGIN_PORTAL_ORIGIN': 'https://' + PORTAL_HOSTS[args.environment], 'EGIN_ORIGIN': 'https://' + HOSTS[args.environment], 'EGIN_RP_ID': HOSTS[args.environment], 'EGIN_DATA_VOLUME': VOLUMES[args.environment]}
    project = f'egin-{args.environment}-{slot}'
    REPORTER.stage('start')
    run('docker', 'compose', '-p', project, '-f', 'deploy/slot.yml', 'up', '-d', '--wait', '--wait-timeout', '100', env=env)
    for service in ['web', 'api']:
        if not healthy(f'{project}-{service}-1'):
            raise SystemExit('Candidate unhealthy; no traffic changed.')
    # Market migrations must actually succeed before this slot can receive traffic.
    market_check = "Promise.all(['/health','/categories'].map(p=>fetch('http://127.0.0.1:4936/api/market'+p,{signal:AbortSignal.timeout(30000)}).then(async r=>{if(!r.ok)throw Error('Market readiness failed');return r.json()}))).then(([h,c])=>{if(!h.ok||h.storage!=='postgresql'||c.categories.filter(x=>!x.parentId).length!==8)throw Error('Market migration verification failed')}).catch(()=>process.exit(1))"
    run('docker', 'exec', f'{project}-api-1', 'node', '-e', market_check)
    chat_check = "fetch('http://127.0.0.1:4936/api/chat/health',{signal:AbortSignal.timeout(30000)}).then(async r=>{const h=await r.json();if(!r.ok||!h.ok||h.storage!=='postgresql')throw Error('Chat migration verification failed')}).catch(()=>process.exit(1))"
    run('docker', 'exec', f'{project}-api-1', 'node', '-e', chat_check)
    REPORTER.stage('assets')
    # Preserve hashed assets for clients with an older page/service worker.
    with tempfile.TemporaryDirectory(prefix='egin-assets-') as temporary:
        run('docker', 'cp', f'{project}-web-1:/usr/share/nginx/html/assets', temporary)
        run('docker', 'cp', str(Path(temporary) / 'assets') + '/.', f'{GATEWAY}:/usr/share/nginx/html/assets/')
        run('docker', 'cp', f'{project}-web-1:/usr/share/nginx/portal/developer-assets', temporary)
        run('docker', 'exec', GATEWAY, 'mkdir', '-p', '/usr/share/nginx/html/developer-assets')
        run('docker', 'cp', str(Path(temporary) / 'developer-assets') + '/.', f'{GATEWAY}:/usr/share/nginx/html/developer-assets/')
    candidate = {'slot': slot, 'release': release, 'portal': True}
    # Recheck the actual candidate after migrations, directly before routing.
    require_demo_compatibility(args.environment, images['api'], current.get('active'), f'{project}-api-1')
    state[args.environment] = {'active': candidate, **({'previous': current['active']} if current else {})}
    REPORTER.stage('switch')
    switch(state)
    print(f"{args.environment}: {release} active in {slot}; previous slot remains running.")


if __name__ == '__main__':
    main()
