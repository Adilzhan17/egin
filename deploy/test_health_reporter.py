import contextlib
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

from health_reporter import DeployReporter


class Receiver(BaseHTTPRequestHandler):
    events = []
    def do_POST(self):
        self.events.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"ok":true}')
    def log_message(self, *args):
        pass


class ReporterTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict('os.environ', {'HEALTH_DEPLOY_URL': '', 'HEALTH_DEPLOY_TOKEN': '', 'HEALTH_DEPLOY_PROJECT': ''})
        self.environment.start()
        Receiver.events = []
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Receiver)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.directory = tempfile.TemporaryDirectory()
        self.config = Path(self.directory.name) / 'health.json'
        self.config.write_text(json.dumps({'url': f'http://127.0.0.1:{self.server.server_port}/api/deployments/ingest', 'token': 'a' * 64}))
    def tearDown(self):
        self.server.shutdown(); self.server.server_close()
        self.directory.cleanup(); self.environment.stop()
    def reporter(self, **kwargs):
        return DeployReporter('deploy', 'staging', config_path=self.config, **kwargs)
    def test_success_stages_are_ordered_and_raw_output_is_not_sent(self):
        with self.reporter() as reporter:
            for stage in reporter.plan[1:]:
                reporter.stage(stage)
                reporter.observe_line('SECRET_TOKEN=should-not-leave-server')
                reporter.last_line = 0
                reporter.observe_line('Step 3/8 : RUN TOKEN=private-command')
        events = Receiver.events
        self.assertEqual(events[0]['type'], 'start')
        self.assertEqual(events[-1]['status'], 'success')
        self.assertEqual([e['seq'] for e in events], list(range(1, len(events) + 1)))
        self.assertNotIn('SECRET_TOKEN', json.dumps(events))
        self.assertNotIn('private-command', json.dumps(events))
        self.assertTrue(any(e.get('code') == 'build_step' for e in events))
    def test_failed_deploy_stays_failed_and_exception_is_preserved(self):
        with self.assertRaisesRegex(RuntimeError, 'private details'):
            with self.reporter() as reporter:
                reporter.stage('build_api')
                raise RuntimeError('private details')
        self.assertEqual(Receiver.events[-1]['status'], 'failure')
        self.assertNotIn('private details', json.dumps(Receiver.events))
    def test_reused_images_skip_build_plan(self):
        with self.reporter(reuse_images='abc1234') as reporter:
            for stage in reporter.plan[1:]:
                reporter.stage(stage)
        self.assertNotIn('build_api', Receiver.events[0]['stages'])
        self.assertEqual(Receiver.events[0]['release'], 'abc1234')
    def test_status_and_missing_config_do_not_send(self):
        with DeployReporter('status', 'production', config_path=self.config):
            pass
        with DeployReporter('deploy', 'staging', config_path=Path(self.directory.name) / 'missing'):
            pass
        self.assertEqual(Receiver.events, [])
    def test_invalid_config_is_fail_open(self):
        self.config.write_text('{bad json')
        with contextlib.redirect_stderr(io.StringIO()):
            with self.reporter() as reporter:
                self.assertFalse(reporter.enabled)
        self.assertEqual(Receiver.events, [])


if __name__ == '__main__':
    unittest.main()
