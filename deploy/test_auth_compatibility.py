"""Authentication upgrade rollback boundary; no real Docker/server operations."""
import argparse
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import manage


class AuthCompatibilityTests(unittest.TestCase):
    def probe(self, labels=None, result=None, container=False):
        responses = (['sha256:immutable-auth-image'] if container else []) + [json.dumps(labels)]
        if result is not None:
            responses.append(json.dumps(result))
        return patch.object(manage, 'guard_capture', side_effect=responses)

    def test_capable_image_does_not_need_database(self):
        with self.probe({manage.AUTH_SECURITY_LABEL: '1'}) as capture:
            manage.require_auth_compatibility('production', 'egin-api:new', None)
        self.assertEqual(capture.call_count, 1)

    def test_legacy_allowed_only_before_security_schema(self):
        with self.probe({}, {'schema': False}) as capture:
            manage.require_auth_compatibility('staging', 'egin-api:old', {'slot': 'blue'})
        self.assertEqual(capture.call_args.args[:5], ('docker', 'exec', '--workdir', '/workspace/apps/api', 'egin-staging-blue-api-1'))
        self.assertIn('security_capabilities', capture.call_args.args[-1])
        self.assertNotIn('SELECT digest', capture.call_args.args[-1])

    def test_marker_blocks_legacy_even_without_migrated_users(self):
        for labels in ({}, None, {manage.AUTH_SECURITY_LABEL: 1}, {manage.AUTH_SECURITY_LABEL: '0'}):
            with self.subTest(labels=labels), self.probe(labels, {'schema': True}):
                with self.assertRaisesRegex(SystemExit, 'lacks authentication security'):
                    manage.require_auth_compatibility('production', 'egin-api:old', {'slot': 'green'})

    def test_retained_slot_uses_immutable_image(self):
        with self.probe({manage.AUTH_SECURITY_LABEL: '1'}, container=True) as capture:
            manage.require_auth_compatibility('production', 'egin-api:tag', {'slot': 'blue'}, 'retained-api')
        self.assertEqual(capture.call_args_list[0].args, ('docker', 'inspect', '--format', '{{.Image}}', 'retained-api'))
        self.assertEqual(capture.call_args_list[1].args[-1], 'sha256:immutable-auth-image')

    def test_unverifiable_schema_fails_closed(self):
        for result in ({}, [], {'schema': 'false'}, {'schema': 0}):
            with self.subTest(result=result), self.probe({}, result):
                with self.assertRaisesRegex(SystemExit, 'could not be verified'):
                    manage.require_auth_compatibility('production', 'egin-api:old', {'slot': 'blue'})
        with self.probe({}), self.assertRaisesRegex(SystemExit, 'without an active API'):
            manage.require_auth_compatibility('production', 'egin-api:old', None)

    def test_manual_rollback_does_not_change_traffic_or_state(self):
        state = {'production': {'active': {'slot': 'blue', 'release': 'new', 'portal': True},
                                'previous': {'slot': 'green', 'release': 'old', 'portal': True}}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'deployments.json'; path.write_text(json.dumps(state))
            def run(*args, **kwargs):
                if '{{.Config.Image}}' in args:
                    return 'egin-api:old' if args[-1].endswith('api-1') else 'egin-web:old'
                return json.dumps(['RP_ID=egin.perricheno.com', 'APP_ORIGINS=https://egin.perricheno.com', 'PORTAL_ORIGIN=https://api-egin.perricheno.com'])
            with patch.object(manage, 'STATE', Path(directory)), patch.object(manage, 'run', side_effect=run), \
                    patch.object(manage, 'healthy', return_value=True), patch.object(manage, 'REPORTER', Mock()), \
                    patch.object(manage, 'require_demo_compatibility'), patch.object(manage, 'require_presence_compatibility'), \
                    patch.object(manage, 'switch') as switch, self.probe({}, {'schema': True}, container=True):
                with self.assertRaisesRegex(SystemExit, 'lacks authentication security'):
                    manage.execute(argparse.Namespace(action='rollback', environment='production', reuse_images=None))
                switch.assert_not_called()
            self.assertEqual(json.loads(path.read_text()), state)

    def test_automatic_recovery_cannot_restore_incompatible_image(self):
        old = {'slot': 'blue', 'release': 'old', 'portal': True}
        new = {'slot': 'green', 'release': 'new', 'portal': True}
        before = {'staging': {'active': old}}
        after = {'staging': {'active': new, 'previous': old}}
        for blocked in (True, False):
            with self.subTest(blocked=blocked), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / 'deployments.json'; path.write_text(json.dumps(before))
                copies = []
                def run(*args, **kwargs):
                    if 'cat' in args: return 'previous-gateway-config'
                    if args[:2] == ('docker', 'cp'): copies.append(Path(args[2]).read_text())
                    return ''
                with patch.object(manage, 'STATE', Path(directory)), patch.object(manage, 'run', side_effect=run), \
                        patch.object(manage, 'REPORTER', None), patch.object(manage.time, 'sleep'), \
                        patch.object(manage.urllib.request, 'urlopen', side_effect=RuntimeError('Unhealthy candidate')), \
                        patch.object(manage, 'require_demo_compatibility'), patch.object(manage, 'require_presence_compatibility'), \
                        patch.object(manage, 'require_auth_compatibility', side_effect=SystemExit('blocked') if blocked else None) as guard:
                    with self.assertRaises(SystemExit if blocked else RuntimeError): manage.switch(after)
                    guard.assert_called_once_with('staging', 'egin-api:old', new, 'egin-staging-blue-api-1')
                self.assertEqual('previous-gateway-config' in copies, not blocked)
                self.assertEqual(json.loads(path.read_text()), before)


if __name__ == '__main__':
    unittest.main()
