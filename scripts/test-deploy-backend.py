"""Exercise backend release isolation and rollback without Docker or a server."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().with_name('deploy-backend.sh')
DOCKER = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
root = Path(os.environ['TEST_ROOT'])
with (root / 'calls').open('a') as out: out.write(json.dumps(args) + '\n')
failure = os.environ.get('TEST_FAIL', '')
if args[0] == 'inspect':
    if args[-1] != 'test-backend' or failure == 'missing': sys.exit(1)
    if '--format' in args:
        template = args[args.index('--format') + 1]
        labels = {
            'com.docker.compose.project.working_dir': str(root),
            'com.docker.compose.project.config_files': str(root / 'compose.yml'),
            'com.docker.compose.project': 'test',
            'com.docker.compose.service': 'backend',
        }
        if os.environ.get('TEST_OLD_OVERRIDE'):
            labels['com.docker.compose.project.config_files'] += ',' + str(root / 'compose.backend-release.yml')
        for key, value in labels.items():
            if '"' + key + '"' in template: print(value)
elif args[0] == 'build' and failure == 'build': sys.exit(1)
elif args[0] == 'compose' and 'up' in args:
    if failure == 'up' and not (root / 'up_failed').exists():
        (root / 'up_failed').touch()
        sys.exit(1)
elif args[0] == 'exec' and '/conditions' in args[-1] and failure == 'verification': sys.exit(1)
'''


class BackendRelease(unittest.TestCase):
    def run_release(self, failure='', key='sk-test-new', old_override=False):
        with tempfile.TemporaryDirectory(prefix='egin-release-test-') as directory:
            root = Path(directory)
            (root / 'bin').mkdir()
            (root / 'source').mkdir()
            docker = root / 'bin' / 'docker'
            docker.write_text(DOCKER)
            docker.chmod(0o700)
            original_env = 'DATABASE_URL=postgres://unchanged\nJWT_SECRET=test-unchanged\nOPENAI_API_KEY=sk-test-old\n'
            (root / '.env').write_text(original_env)
            (root / 'compose.yml').write_text('services:\n  backend:\n    image: test:old\n')
            original_override = 'services:\n  backend:\n    image: test:previous-release\n'
            if old_override:
                (root / 'compose.backend-release.yml').write_text(original_override)
            result = subprocess.run(
                ['bash', str(SCRIPT), str(root / 'source')],
                env={**os.environ, 'PATH': str(root / 'bin') + os.pathsep + os.environ['PATH'],
                     'TEST_ROOT': str(root), 'TEST_FAIL': failure,
                     'TEST_OLD_OVERRIDE': 'yes' if old_override else '',
                     'RELEASE_SHA': 'a' * 40, 'BACKEND_CONTAINER': 'test-backend',
                     'BACKEND_ENV_FILE': str(root / '.env'), 'DEPLOY_OPENAI_API_KEY': key},
                capture_output=True, text=True, timeout=10,
            )
            calls = [json.loads(line) for line in (root / 'calls').read_text().splitlines()]
            self.assertNotIn('sk-test-new', result.stdout + result.stderr)
            up_calls = [call for call in calls if call[0] == 'compose' and 'up' in call]
            for call in up_calls:
                self.assertEqual(call[-1], 'backend')
                self.assertIn('--no-deps', call)
                self.assertIn('--no-build', call)
                self.assertNotIn('--remove-orphans', call)
            if failure:
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertEqual((root / '.env').read_text(), original_env)
                if old_override:
                    self.assertEqual((root / 'compose.backend-release.yml').read_text(), original_override)
                else:
                    self.assertFalse((root / 'compose.backend-release.yml').exists())
                if failure in ('up', 'verification'):
                    self.assertEqual(len(up_calls), 2, 'Must restore the previous backend')
                else:
                    self.assertEqual(up_calls, [])
            else:
                self.assertEqual(result.returncode, 0, result.stderr)
                expected = original_env.replace('sk-test-old', key) if key else original_env
                self.assertEqual((root / '.env').read_text(), expected)
                override = (root / 'compose.backend-release.yml').read_text()
                self.assertIn('image: egin-backend:' + 'a' * 40, override)
                self.assertEqual(len(up_calls), 1)

    def test_updates_only_backend_preserving_other_settings(self):
        self.run_release()

    def test_preserves_existing_key_when_new_secret_is_absent(self):
        self.run_release(key='')

    def test_build_failure_does_not_change_running_configuration(self):
        self.run_release(failure='build')

    def test_startup_failure_restores_environment_and_base_compose(self):
        self.run_release(failure='up')

    def test_failed_release_check_restores_previous_override(self):
        self.run_release(failure='verification', old_override=True)


if __name__ == '__main__':
    unittest.main()
