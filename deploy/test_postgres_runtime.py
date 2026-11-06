"""Deployment privilege gate; all Docker operations are mocked."""
import json
import unittest
from unittest.mock import patch
import manage


class PostgresRuntimeTests(unittest.TestCase):
    def test_new_image_requires_capability(self):
        for labels in ({}, None, {'com.egin.api.postgres-runtime': 1}):
            with self.subTest(labels=labels), patch.object(manage, 'guard_capture', return_value=json.dumps(labels)):
                with self.assertRaisesRegex(SystemExit, 'runtime isolation'):
                    manage.require_postgres_runtime('api:legacy')
        with patch.object(manage, 'guard_capture', return_value=json.dumps({'com.egin.api.postgres-runtime': '1'})):
            manage.require_postgres_runtime('api:new')

    def test_retained_slot_checks_immutable_image_and_actual_role(self):
        for result in ({'safe': False}, {'safe': 'true'}, {}, []):
            with self.subTest(result=result), patch.object(manage, 'guard_capture', side_effect=[
                    'sha256:retained', json.dumps({'com.egin.api.postgres-runtime': '1'}), json.dumps(result)]):
                with self.assertRaisesRegex(SystemExit, 'runtime isolation'):
                    manage.require_postgres_runtime('api:tag', 'old-api')
        with patch.object(manage, 'guard_capture', side_effect=[
                'sha256:retained', json.dumps({'com.egin.api.postgres-runtime': '1'}), '{"safe":true}']) as capture:
            manage.require_postgres_runtime('api:tag', 'old-api')
            self.assertEqual(capture.call_args_list[1].args[-1], 'sha256:retained')
            self.assertIn('assertRuntimeRole', capture.call_args.args[-1])


if __name__ == '__main__':
    unittest.main()
