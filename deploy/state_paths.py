"""Shared deployment state for clean, isolated source checkouts."""
import os
from pathlib import Path


def state_directory(root: Path) -> Path:
    configured = os.environ.get('EGIN_DEPLOY_STATE_DIR')
    if configured:
        path = Path(configured).expanduser()
        if not path.is_absolute():
            raise ValueError('EGIN_DEPLOY_STATE_DIR must be an absolute path')
        return path.resolve()
    return root / 'deploy/state'
