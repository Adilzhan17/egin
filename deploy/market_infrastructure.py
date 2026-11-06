"""Isolated Market services. Never migrates the application's existing SQLite DB."""
import os
import secrets
import subprocess
import time
import gzip
from pathlib import Path
from state_paths import state_directory

ROOT = Path(__file__).resolve().parent.parent


def prepare_market(environment, release=None, api_image=None):
    if environment not in ('staging', 'production', 'test'):
        raise ValueError('Unknown Market environment')
    if not api_image:
        raise ValueError('An API image with the separate database migrator is required')
    state = state_directory(ROOT)
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    state.chmod(0o700)
    secret = state / f'market-{environment}.password'
    if not secret.exists():
        fd = os.open(secret, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as target:
            target.write(secrets.token_urlsafe(36))
    password = secret.read_text().strip()
    secret.chmod(0o600)
    env = {**os.environ, 'MARKET_ENV': environment, 'MARKET_DB_PASSWORD': password}
    if release:
        env['MARKET_INFERENCE_IMAGE'] = f'egin-market-inference:{release}'
        env['MARKET_DATABASE_IMAGE'] = f'egin-database:{release}'
    elif not env.get('MARKET_DATABASE_IMAGE'):
        raise ValueError('MARKET_DATABASE_IMAGE is required without a release tag')
    subprocess.run(['docker', 'compose', '-p', f'egin-market-{environment}', '-f',
                    'deploy/market.yml', 'up', '-d', '--wait', '--wait-timeout', '180'],
                   cwd=ROOT, env=env, check=True)
    # A consistent PostgreSQL backup before additive application migrations.
    backup_dir = state / 'market-backups' / environment
    backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    backup = backup_dir / f'{time.time_ns()}.sql.gz'
    with gzip.open(backup, 'wb') as target:
        process = subprocess.Popen(['docker', 'exec', f'egin-market-{environment}-database-1',
                                    'pg_dump', '-U', 'market', '-d', 'market', '--no-owner', '--no-acl'],
                                   stdout=subprocess.PIPE)
        while chunk := process.stdout.read(1024 * 1024):
            target.write(chunk)
        if process.wait():
            backup.unlink(missing_ok=True)
            raise RuntimeError('Market backup failed; deployment stopped')
    backup.chmod(0o600)
    runtime_secret = state / f'market-{environment}-runtime.password'
    if not runtime_secret.exists():
        fd = os.open(runtime_secret, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as target:
            target.write(secrets.token_urlsafe(36))
    runtime_password = runtime_secret.read_text().strip()
    runtime_secret.chmod(0o600)
    migration_env = {**os.environ,
                     'MARKET_DATABASE_URL': f'postgresql://market:{password}@market-db:5432/market',
                     'EGIN_RUNTIME_PASSWORD': runtime_password}
    # Pass names, never secret values, on the process command line. The short
    # lived migration container is removed before the runtime slot starts.
    subprocess.run(['docker', 'run', '--rm', '--network', f'egin-market-{environment}',
                    '--env', 'MARKET_DATABASE_URL', '--env', 'EGIN_RUNTIME_PASSWORD',
                    api_image, 'node', 'scripts/migrate-database.mjs'],
                   cwd=ROOT, env=migration_env, check=True)
    return {'MARKET_DATABASE_URL': f'postgresql://egin_runtime:{runtime_password}@market-db:5432/market',
            'EGIN_DATABASE_MODE': 'verify',
            'MARKET_INFERENCE_URL': 'http://market-inference:8080',
            'MARKET_NETWORK': f'egin-market-{environment}',
            'INFERENCE_NETWORK': f'egin-inference-{environment}'}


if __name__ == '__main__':
    import sys
    if len(sys.argv) != 3:
        raise SystemExit('Usage: market_infrastructure.py <environment> <api-image>')
    prepare_market(sys.argv[1], api_image=sys.argv[2])
