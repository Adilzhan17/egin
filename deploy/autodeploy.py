#!/usr/bin/env python3
"""Poll main, deploy only its fully checked commit, staging before production."""
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request

from state_paths import state_directory

ROOT = Path(__file__).resolve().parent.parent
STATE = state_directory(ROOT)
REPOSITORY = 'Adilzhan17/egin'
REQUIRED = frozenset({'Mobile checks', 'Chat checks', 'Market checks', 'Trade, billing and video notes'})
HOSTS = {'staging': ('dev-egin.perricheno.com', 'dev-api-egin.perricheno.com'),
         'production': ('egin.perricheno.com', 'api-egin.perricheno.com')}


def checks_pass(runs, sha):
    """Require the latest run of each required workflow for this exact commit."""
    latest = {}
    for run in runs:
        name = run.get('name')
        if name in REQUIRED and run.get('head_sha') == sha and run.get('event') == 'push':
            if name not in latest or (run.get('run_number', 0), run.get('run_attempt', 0)) > (latest[name].get('run_number', 0), latest[name].get('run_attempt', 0)):
                latest[name] = run
    return REQUIRED == latest.keys() and all(run.get('status') == 'completed' and run.get('conclusion') == 'success' for run in latest.values())


def command(*args, capture=False):
    return subprocess.run(args, cwd=ROOT, check=True, text=True, stdout=subprocess.PIPE if capture else None).stdout


def remote_sha():
    return command('git', 'ls-remote', 'origin', 'refs/heads/main', capture=True).split()[0]


def github_runs(sha):
    credential = subprocess.run(['git', 'credential', 'fill'], cwd=ROOT, input='protocol=https\nhost=github.com\n\n', text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True)
    values = dict(line.split('=', 1) for line in credential.stdout.splitlines() if '=' in line)
    headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'egin-autodeploy', 'Authorization': 'Bearer ' + values['password']}
    url = f'https://api.github.com/repos/{REPOSITORY}/actions/runs?head_sha={sha}&event=push&per_page=100'
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
        data = json.load(response)
    if data.get('total_count', 0) > 100:
        raise RuntimeError('Too many workflow runs to verify safely')
    return data['workflow_runs']


def active_release(environment):
    return json.loads((STATE / 'deployments.json').read_text())[environment]['active']['release']


def verify(environment, release):
    for host, path in [(HOSTS[environment][0], '/api/health'), (HOSTS[environment][0], '/'), (HOSTS[environment][1], '/')]:
        request = urllib.request.Request('http://127.0.0.1:4934' + path, headers={'Host': host})
        with urllib.request.urlopen(request, timeout=20) as response:
            if response.status != 200 or response.headers.get('X-EGIN-Release') != release:
                raise RuntimeError(f'{environment} gateway verification failed for {host}{path}')
            if path == '/api/health' and not json.load(response).get('ok'):
                raise RuntimeError(f'{environment} API health failed')


def main():
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (STATE / 'autodeploy.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Deployment already running'); return
        sha = remote_sha()
        if active_release('production').startswith(sha[:7] + '-'):
            print('Production is already at main'); return
        if not checks_pass(github_runs(sha), sha):
            print('Waiting for all required successful CI checks for ' + sha[:12]); return
        marker = STATE / 'autodeploy-failure.json'
        if marker.exists():
            previous = json.loads(marker.read_text())
            if previous.get('sha') == sha and time.time() - previous.get('time', 0) < 600:
                print('Recent deployment failed; waiting before retry'); return
        command('git', 'fetch', 'origin', 'refs/heads/main:refs/remotes/origin/main')
        if remote_sha() != sha:
            print('Main advanced; waiting for its checks'); return
        if command('git', 'status', '--porcelain', capture=True).strip():
            raise RuntimeError('Deployment checkout has local changes')
        command('git', 'checkout', '--detach', sha)
        try:
            command(sys.executable, 'deploy/manage.py', 'deploy', 'staging')
            release = active_release('staging')
            if not release.startswith(sha[:7] + '-'):
                raise RuntimeError('Staging release does not match checked commit')
            verify('staging', release)
            if remote_sha() != sha:
                print('Main advanced during staging; production unchanged'); return
            command(sys.executable, 'deploy/manage.py', 'deploy', 'production', '--reuse-images', release)
            verify('production', release)
            marker.unlink(missing_ok=True)
            print('Production verified: ' + release)
        except Exception:
            marker.write_text(json.dumps({'sha': sha, 'time': time.time()}))
            raise


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Avoid printing credentials or environment values.
        print('Autodeployment failed:', type(error).__name__, file=sys.stderr)
        sys.exit(1)
