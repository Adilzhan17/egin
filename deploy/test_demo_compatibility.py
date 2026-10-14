"""No Docker daemon or production database is touched by these guard tests."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

import manage


class DemoCompatibilityTests(unittest.TestCase):
    def probe(self, labels=None, result=None, container=False):
        responses = (["sha256:actual-running-image"] if container else []) + [json.dumps(labels)]
        if result is not None:
            responses.append(json.dumps(result))
        return patch.object(manage, 'guard_capture', side_effect=responses)

    def test_capable_image_needs_no_database_or_active_slot(self):
        with self.probe({manage.DEMO_ISOLATION_LABEL: '1'}) as capture:
            manage.require_demo_compatibility('production', 'egin-api:new', None)
        self.assertEqual(capture.call_count, 1)

    def test_old_image_allowed_only_before_demo_migration_and_identities(self):
        with self.probe({}, {'schema': False, 'scenarios': 0, 'identities': 0}) as capture:
            manage.require_demo_compatibility('staging', 'egin-api:old', {'slot': 'green'})
        command = capture.call_args.args
        self.assertEqual(command[:5], ('docker', 'exec', '--workdir', '/workspace/apps/api', 'egin-staging-green-api-1'))
        self.assertIn('process.env.MARKET_DATABASE_URL', command[-1])
        self.assertIn("id GLOB 'demo:*'", command[-1])
        self.assertNotIn('postgresql://', ' '.join(command))

    def test_migration_alone_blocks_legacy_even_before_first_scenario(self):
        with self.probe(None, {'schema': True, 'scenarios': 0, 'identities': 0}):
            with self.assertRaisesRegex(SystemExit, 'lacks demo isolation'):
                manage.require_demo_compatibility('production', 'egin-api:old', {'slot': 'blue'})

    def test_existing_scenario_and_orphan_synthetic_identities_each_block(self):
        for result in ({'schema': True, 'scenarios': 2, 'identities': 6},
                       {'schema': False, 'scenarios': 0, 'identities': 3}):
            with self.subTest(result=result), self.probe({}, result):
                with self.assertRaises(SystemExit):
                    manage.require_demo_compatibility('production', 'egin-api:old', {'slot': 'blue'})

    def test_rollback_inspects_actual_container_image_not_mutable_tag(self):
        with self.probe({manage.DEMO_ISOLATION_LABEL: '1'}, container=True) as capture:
            manage.require_demo_compatibility('production', 'egin-api:retagged', {'slot': 'blue'}, 'old-api')
        self.assertEqual(capture.call_args_list[0].args, ('docker', 'inspect', '--format', '{{.Image}}', 'old-api'))
        self.assertEqual(capture.call_args_list[1].args[-1], 'sha256:actual-running-image')

    def test_unknown_capability_version_does_not_bypass_guard(self):
        for label in ('0', 'unknown', True, 1):
            with self.subTest(label=label), self.probe({manage.DEMO_ISOLATION_LABEL: label}, {'schema': True, 'scenarios': 0, 'identities': 0}):
                with self.assertRaises(SystemExit):
                    manage.require_demo_compatibility('production', 'egin-api:old', {'slot': 'blue'})

    def test_missing_active_api_and_invalid_query_results_fail_closed(self):
        with self.probe({}):
            with self.assertRaisesRegex(SystemExit, 'without an active API'):
                manage.require_demo_compatibility('production', 'egin-api:old', None)
        for result in ({}, {'schema': False, 'scenarios': False, 'identities': 0},
                       {'schema': 'false', 'scenarios': 0, 'identities': 0},
                       {'schema': False, 'scenarios': 0, 'identities': -1}):
            with self.subTest(result=result), self.probe({}, result):
                with self.assertRaisesRegex(SystemExit, 'could not be verified'):
                    manage.require_demo_compatibility('production', 'egin-api:old', {'slot': 'blue'})

    def test_query_timeout_and_raw_database_errors_are_not_printed(self):
        for failure in (subprocess.CalledProcessError(1, ['docker'], output='postgresql://secret', stderr='PASSWORD=private'),
                        subprocess.TimeoutExpired(['docker'], 20, output='private'), OSError('secret')):
            with self.subTest(failure=type(failure)), patch.object(manage.subprocess, 'run', side_effect=failure):
                with self.assertRaisesRegex(SystemExit, 'no traffic changed') as raised:
                    manage.guard_capture('docker', 'exec', 'active-api', 'node', '-e', manage.DEMO_ISOLATION_CHECK)
                self.assertNotIn('secret', str(raised.exception))
                self.assertNotIn('private', str(raised.exception))

    def test_guard_subprocess_captures_both_streams_with_timeout(self):
        with patch.object(manage.subprocess, 'run', return_value=Mock(stdout='{}\n')) as call:
            self.assertEqual(manage.guard_capture('docker', 'image', 'inspect', 'image'), '{}')
        self.assertEqual(call.call_args.kwargs['stderr'], subprocess.PIPE)
        self.assertEqual(call.call_args.kwargs['stdout'], subprocess.PIPE)
        self.assertEqual(call.call_args.kwargs['timeout'], 20)

    def test_dockerfile_declares_versioned_isolation_capability(self):
        dockerfile = (Path(__file__).parent / 'Api.Dockerfile').read_text()
        self.assertIn('LABEL com.egin.api.demo-isolation="1"', dockerfile)

    def test_execute_refuses_rollback_before_switch_or_state_write(self):
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
                    patch.object(manage, 'switch') as switch, \
                    self.probe({}, {'schema': True, 'scenarios': 1, 'identities': 3}, container=True):
                with self.assertRaises(SystemExit):
                    manage.execute(argparse.Namespace(action='rollback', environment='production', reuse_images=None))
                switch.assert_not_called()
            self.assertEqual(json.loads(path.read_text()), state)

    def test_reused_legacy_image_is_blocked_before_candidate_start(self):
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
                    self.probe({}, {'schema': True, 'scenarios': 0, 'identities': 0}):
                with self.assertRaises(SystemExit):
                    manage.execute(argparse.Namespace(action='deploy', environment='staging', reuse_images='legacy'))
                switch.assert_not_called(); prepare.assert_not_called()
                self.assertFalse(any(call.args[:2] == ('docker', 'compose') for call in commands.call_args_list))
            self.assertEqual(json.loads(path.read_text()), state)

    def test_automatic_recovery_cannot_restore_an_incompatible_previous_api(self):
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
                        patch.object(manage, 'require_presence_compatibility'), \
                        patch.object(manage.urllib.request, 'urlopen', side_effect=RuntimeError('Unhealthy candidate')), \
                        patch.object(manage, 'require_demo_compatibility', side_effect=SystemExit('blocked') if blocked else None) as guard:
                    with self.assertRaises(SystemExit if blocked else RuntimeError):
                        manage.switch(after)
                    guard.assert_called_once_with('staging', 'egin-api:legacy', new, 'egin-staging-blue-api-1')
                self.assertEqual('previous-gateway-config' in copies, not blocked)
                self.assertEqual(json.loads(path.read_text()), before)


if __name__ == '__main__':
    unittest.main()
