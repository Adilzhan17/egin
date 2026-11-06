"""Isolated Market services. Never migrates the application's existing SQLite DB."""
import os
import secrets
import subprocess
import time
import gzip
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def prepare_market(environment, release=None):
    if environment not in ('staging', 'production', 'test'):
        raise ValueError('Unknown Market environment')
    state = ROOT / 'deploy/state'
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    secret = state / f'market-{environment}.password'
    if not secret.exists():
        fd = os.open(secret, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as target:
            target.write(secrets.token_urlsafe(36))
    password = secret.read_text().strip()
    env = {**os.environ, 'MARKET_ENV': environment, 'MARKET_DB_PASSWORD': password}
    if release:
        env['MARKET_INFERENCE_IMAGE'] = f'egin-market-inference:{release}'
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
    return {'MARKET_DATABASE_URL': f'postgresql://market:{password}@market-db:5432/market',
            'MARKET_INFERENCE_URL': 'http://market-inference:8080',
            'MARKET_NETWORK': f'egin-market-{environment}'}


if __name__ == '__main__':
    import sys
    prepare_market(sys.argv[1] if len(sys.argv) > 1 else 'staging')
