"""Presence privacy rollback boundary; no Docker or live database access."""
import argparse
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import manage


class PresenceCompatibilityTests(unittest.TestCase):
    def probe(self, labels=None, result=None, container=False):
        responses = (['sha256:immutable-presence-image'] if container else []) + [json.dumps(labels)]
        if result is not None:
            responses.append(json.dumps(result))
        return patch.object(manage, 'guard_capture', side_effect=responses)

    def test_capable_image_needs_no_database(self):
        with self.probe({manage.PRESENCE_PRIVACY_LABEL: '1'}) as capture:
            manage.require_presence_compatibility('production', 'egin-api:new', None)
        self.assertEqual(capture.call_count, 1)

    def test_legacy_allowed_only_before_audience_schema_exists(self):
        with self.probe({}, {'schema': False}) as capture:
            manage.require_presence_compatibility('staging', 'egin-api:legacy', {'slot': 'blue'})
        self.assertEqual(capture.call_args.args[:5], ('docker', 'exec', '--workdir', '/workspace/apps/api', 'egin-staging-blue-api-1'))
        code = capture.call_args.args[-1]
        self.assertIn('process.env.CHAT_DATABASE_URL||process.env.MARKET_DATABASE_URL', code)
        self.assertIn("to_regclass('chat_privacy')", code)
        self.assertIn("attname='presence_audience'", code)
        # Guard the schema even when no restricted users currently exist: a
        # still-running new slot could write an interlocutors preference later.
        self.assertNotIn('count(*)', code)
        self.assertNotIn('postgresql://', code)

    def test_new_column_blocks_legacy_without_needing_any_private_rows(self):
        for labels in (None, {}, {manage.DEMO_ISOLATION_LABEL: '1'},
                       {manage.PRESENCE_PRIVACY_LABEL: '0'},
                       {manage.PRESENCE_PRIVACY_LABEL: True},
                       {manage.PRESENCE_PRIVACY_LABEL: 1}):
            with self.subTest(labels=labels), self.probe(labels, {'schema': True}):
                with self.assertRaisesRegex(SystemExit, 'lacks audience-aware presence privacy'):
                    manage.require_presence_compatibility('production', 'egin-api:legacy', {'slot': 'green'})

    def test_actual_retained_image_checked_not_mutable_tag(self):
        with self.probe({manage.PRESENCE_PRIVACY_LABEL: '1'}, container=True) as capture:
            manage.require_presence_compatibility('production', 'egin-api:retagged', {'slot': 'blue'}, 'retained-api')
        self.assertEqual(capture.call_args_list[0].args, ('docker', 'inspect', '--format', '{{.Image}}', 'retained-api'))
        self.assertEqual(capture.call_args_list[1].args[-1], 'sha256:immutable-presence-image')

    def test_unknown_schema_and_missing_active_fail_closed(self):
        for result in ({}, {'schema': 'false'}, {'schema': 0}, {'schema': None}, []):
            with self.subTest(result=result), self.probe({}, result):
                with self.assertRaisesRegex(SystemExit, 'could not be verified'):
                    manage.require_presence_compatibility('production', 'egin-api:legacy', {'slot': 'blue'})
        with self.probe({}):
            with self.assertRaisesRegex(SystemExit, 'without an active API'):
                manage.require_presence_compatibility('production', 'egin-api:legacy', None)

    def test_docker_image_advertises_presence_capability(self):
        self.assertIn('LABEL com.egin.api.presence-privacy="1"', (Path(__file__).parent / 'Api.Dockerfile').read_text())

    def test_manual_rollback_cannot_route_or_modify_state(self):
        state = {'production': {'active': {'slot': 'blue', 'release': 'new', 'portal': True},
                                'previous': {'slot': 'green', 'release': 'legacy', 'portal': True}}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'deployments.json'; path.write_text(json.dumps(state))
            def run(*args, **kwargs):
                if '{{.Config.Image}}' in args:
                    return 'egin-api:legacy' if args[-1].endswith('api-1') else 'egin-web:legacy'
                return json.dumps(['RP_ID=egin.perricheno.com', 'APP_ORIGINS=https://egin.perricheno.com',
                                   'PORTAL_ORIGIN=https://api-egin.perricheno.com'])
            with patch.object(manage, 'STATE', Path(directory)), patch.object(manage, 'run', side_effect=run), \
                    patch.object(manage, 'healthy', return_value=True), patch.object(manage, 'REPORTER', Mock()), \
                    patch.object(manage, 'switch') as switch, patch.object(manage, 'require_demo_compatibility'), \
                    self.probe({}, {'schema': True}, container=True):
                with self.assertRaisesRegex(SystemExit, 'lacks audience-aware'):
                    manage.execute(argparse.Namespace(action='rollback', environment='production', reuse_images=None))
                switch.assert_not_called()
            self.assertEqual(json.loads(path.read_text()), state)

    def test_reused_legacy_image_blocked_before_candidate_start(self):
        state = {'staging': {'active': {'slot': 'blue', 'release': 'new', 'portal': True}}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'deployments.json'; path.write_text(json.dumps(state))
            def run(*args, **kwargs):
                if '{{json .NetworkSettings.Networks}}' in args:
                    return json.dumps({'egin-edge': {}})
                if args[:3] == ('docker', 'network', 'ls'):
                    return 'egin-edge'
                return ''
            with patch.object(manage, 'STATE', Path(directory)), patch.object(manage, 'run', side_effect=run) as commands, \
                    patch.object(manage, 'healthy', return_value=True), patch.object(manage, 'REPORTER', Mock()), \
                    patch.object(manage, 'prepare_market') as prepare, patch.object(manage, 'switch') as switch, \
                    patch.object(manage, 'require_demo_compatibility'), self.probe({}, {'schema': True}):
                with self.assertRaisesRegex(SystemExit, 'lacks audience-aware'):
                    manage.execute(argparse.Namespace(action='deploy', environment='staging', reuse_images='legacy'))
                switch.assert_not_called(); prepare.assert_not_called()
                self.assertFalse(any(call.args[:2] == ('docker', 'compose') for call in commands.call_args_list))
            self.assertEqual(json.loads(path.read_text()), state)

    def test_automatic_recovery_checks_privacy_before_restoring_traffic(self):
        old = {'slot': 'blue', 'release': 'legacy', 'portal': True}
        new = {'slot': 'green', 'release': 'new', 'portal': True}
        before = {'staging': {'active': old}}
        after = {'staging': {'active': new, 'previous': old}}
        for blocked in (True, False):
            with self.subTest(blocked=blocked), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / 'deployments.json'; path.write_text(json.dumps(before))
                copies = []
                def run(*args, **kwargs):
                    if 'cat' in args:
                        return 'previous-gateway-config'
                    if args[:2] == ('docker', 'cp'):
                        copies.append(Path(args[2]).read_text())
                    return ''
                with patch.object(manage, 'STATE', Path(directory)), patch.object(manage, 'run', side_effect=run), \
                        patch.object(manage, 'REPORTER', None), patch.object(manage.time, 'sleep'), \
                        patch.object(manage.urllib.request, 'urlopen', side_effect=RuntimeError('Unhealthy candidate')), \
                        patch.object(manage, 'require_demo_compatibility'), \
                        patch.object(manage, 'require_presence_compatibility', side_effect=SystemExit('blocked') if blocked else None) as guard:
                    with self.assertRaises(SystemExit if blocked else RuntimeError):
                        manage.switch(after)
                    guard.assert_called_once_with('staging', 'egin-api:legacy', new, 'egin-staging-blue-api-1')
                self.assertEqual('previous-gateway-config' in copies, not blocked)
                self.assertEqual(json.loads(path.read_text()), before)


if __name__ == '__main__':
    unittest.main()
