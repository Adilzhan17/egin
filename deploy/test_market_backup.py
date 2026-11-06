"""Backup failures must stop deployment before replacing a persistent DB."""
import gzip
import io
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

import market_infrastructure as market


class MarketBackupTests(unittest.TestCase):
    def prepare(self, existing=True, orphan=False, backup_error=False):
        calls = []

        def run(command, **kwargs):
            if command[1:3] == ['container', 'ls']:
                calls.append('inspect')
                return Mock(stdout='egin-market-test-database-1\n' if existing else '')
            if command[1:3] == ['volume', 'ls']:
                return Mock(stdout='egin-market-test-postgres\n' if orphan else '')
            calls.append('compose' if command[1] == 'compose' else 'migrate')
            if command[1] == 'run':
                self.assertNotIn(kwargs['env']['EGIN_RUNTIME_PASSWORD'], command)
            return Mock(returncode=0)

        def backup(*args):
            calls.append('backup')
            if backup_error:
                raise RuntimeError('dump failed')

        with tempfile.TemporaryDirectory() as directory, \
                patch.object(market, 'state_directory', return_value=Path(directory)), \
                patch.object(market.subprocess, 'run', side_effect=run), \
                patch.object(market, 'backup_database', side_effect=backup):
            if orphan or backup_error:
                with self.assertRaises(RuntimeError):
                    market.prepare_market('test', release='ci', api_image='api:ci')
                self.assertNotIn('compose', calls)
                self.assertNotIn('migrate', calls)
            else:
                result = market.prepare_market('test', release='ci', api_image='api:ci')
                self.assertTrue(result['MARKET_DATABASE_URL'].startswith('postgresql://egin_runtime:'))
                self.assertEqual(result['EGIN_DATABASE_MODE'], 'verify')
        return calls

    def test_existing_database_is_backed_up_before_image_replacement(self):
        self.assertEqual(self.prepare(), ['inspect', 'backup', 'compose', 'migrate'])

    def test_failed_backup_stops_all_deployment_mutations(self):
        self.prepare(backup_error=True)

    def test_orphaned_existing_volume_requires_operator_recovery(self):
        self.prepare(existing=False, orphan=True)

    def test_new_database_is_backed_up_before_schema_migration(self):
        self.assertEqual(self.prepare(existing=False), ['inspect', 'compose', 'backup', 'migrate'])

    def test_docker_inspection_failure_is_not_a_new_installation(self):
        with tempfile.TemporaryDirectory() as directory, \
                patch.object(market, 'state_directory', return_value=Path(directory)), \
                patch.object(market.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'docker')) as run:
            with self.assertRaises(subprocess.CalledProcessError):
                market.prepare_market('test', release='ci', api_image='api:ci')
            self.assertEqual(run.call_count, 1)

    def test_dump_is_compressed_and_failed_output_removed(self):
        for exit_code in (0, 1):
            with self.subTest(exit_code=exit_code), tempfile.TemporaryDirectory() as directory:
                process = Mock(stdout=io.BytesIO(b'CREATE TABLE preserved(id int);'),
                               wait=Mock(return_value=exit_code), poll=Mock(return_value=exit_code))
                with patch.object(market.subprocess, 'Popen', return_value=process):
                    state = Path(directory)
                    if exit_code:
                        with self.assertRaisesRegex(RuntimeError, 'backup failed'):
                            market.backup_database(state, 'test', 'isolated-db')
                        self.assertEqual(list(state.rglob('*.sql.gz')), [])
                    else:
                        backup = market.backup_database(state, 'test', 'isolated-db')
                        self.assertEqual(gzip.decompress(backup.read_bytes()), b'CREATE TABLE preserved(id int);')
                        if os.name != 'nt':
                            self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
                self.assertTrue(process.stdout.closed)

    def test_backup_name_collision_preserves_the_previous_backup(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(market.time, 'time_ns', return_value=123):
            state = Path(directory)
            saved = state / 'market-backups' / 'test' / '123.sql.gz'
            saved.parent.mkdir(parents=True)
            saved.write_bytes(b'previous backup')
            with self.assertRaises(FileExistsError):
                market.backup_database(state, 'test', 'isolated-db')
            self.assertEqual(saved.read_bytes(), b'previous backup')


if __name__ == '__main__':
    unittest.main()
