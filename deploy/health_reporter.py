"""Best-effort deployment telemetry. Only curated events leave the server."""
import json
import os
from pathlib import Path
import queue
import re
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / 'deploy/state/health.json'


class DeploymentCancelled(SystemExit):
    pass


class DeployReporter:
    def __init__(self, action, environment, reuse_images=None, config_path=CONFIG):
        self.action = action
        self.environment = environment
        self.reuse_images = reuse_images
        self.enabled = False
        self.current = None
        self.seq = 0
        self.run_id = str(uuid.uuid4())
        self.events = queue.Queue(maxsize=512)
        self.stop = threading.Event()
        self.sequence_lock = threading.Lock()
        self.worker = None
        self.heartbeat = None
        self.last_line = 0
        self.previous_sigterm = None
        if action == 'status':
            return
        try:
            config = json.loads(Path(config_path).read_text()) if Path(config_path).exists() else {}
            self.endpoint = os.environ.get('HEALTH_DEPLOY_URL') or config.get('url', '')
            self.token = os.environ.get('HEALTH_DEPLOY_TOKEN') or config.get('token', '')
            self.project = os.environ.get('HEALTH_DEPLOY_PROJECT') or config.get('project', 'egin')
            parsed = urllib.parse.urlparse(self.endpoint)
            if self.endpoint and self.token:
                if parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1')):
                    raise ValueError('Telemetry requires HTTPS')
                if parsed.username or parsed.password or not re.fullmatch(r'[a-zA-Z0-9_-]{32,256}', self.token):
                    raise ValueError('Invalid telemetry configuration')
                self.enabled = True
        except Exception:
            print('[health] Invalid telemetry configuration; deployment will continue without reporting.', file=sys.stderr)

    def __enter__(self):
        if not self.enabled:
            return self
        self.worker = threading.Thread(target=self._send, daemon=True)
        self.worker.start()
        try:
            commit = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()
        except Exception:
            commit = None
        self.plan = ['prepare', 'switch', 'verify'] if self.action == 'rollback' else ['prepare', *([] if self.reuse_images else ['build_api', 'build_web']), 'backup', 'start', 'assets', 'switch', 'verify']
        self.emit('start', action=self.action, stages=self.plan, commit=commit, release=self.reuse_images)
        self.stage('prepare')
        self.heartbeat = threading.Thread(target=self._keepalive, daemon=True)
        self.heartbeat.start()
        if threading.current_thread() is threading.main_thread():
            self.previous_sigterm = signal.getsignal(signal.SIGTERM)
            signal.signal(signal.SIGTERM, lambda sig, _frame: (_ for _ in ()).throw(DeploymentCancelled(128 + sig)))
        return self

    def __exit__(self, kind, error, traceback):
        if not self.worker:
            return False
        if self.previous_sigterm is not None:
            signal.signal(signal.SIGTERM, self.previous_sigterm)
        self.stop.set()
        if kind is None:
            if self.current:
                self.emit('stage', stage=self.current, state='complete')
            self.emit('finish', status='success')
        else:
            cancelled = isinstance(error, (KeyboardInterrupt, DeploymentCancelled))
            self.emit('log', code='aborted' if cancelled else 'command_failed')
            self.emit('finish', status='cancelled' if cancelled else 'failure')
        self.events.put_nowait(None) if not self.events.full() else None
        self.worker.join(timeout=8)
        if self.worker.is_alive() or self.events.unfinished_tasks:
            print('[health] Telemetry delivery incomplete; monitoring will mark the stream interrupted.', file=sys.stderr)
        return False

    def emit(self, event_type, **fields):
        if not self.enabled:
            return
        with self.sequence_lock:
            if self.events.full():
                if event_type in ('log', 'heartbeat'):
                    return
                self.enabled = False
                print('[health] Telemetry queue is full; deployment continues without reporting.', file=sys.stderr)
                return
            self.seq += 1
            self.events.put_nowait({'project': self.project, 'runId': self.run_id, 'environment': self.environment, 'seq': self.seq, 'type': event_type, **fields})

    def stage(self, stage):
        if not self.enabled or stage == self.current:
            return
        if self.current:
            self.emit('stage', stage=self.current, state='complete')
        self.current = stage
        self.emit('stage', stage=stage, state='running')

    def observe_line(self, line):
        if not self.enabled or time.monotonic() - self.last_line < .75:
            return
        plain = re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', line).strip()
        step = re.match(r'(?:Step\s+(\d+)/(\d+)|#(\d+)\s+\[[^\]]*?\s(\d+)/(\d+)\])', plain)
        if step:
            current = int(step.group(1) or step.group(4))
            total = int(step.group(2) or step.group(5))
            self.emit('log', code='build_step', step=current, total=total)
        elif re.match(r'#\d+\s+CACHED', plain):
            self.emit('log', code='build_cached')
        elif re.match(r'#\d+\s+DONE', plain):
            self.emit('log', code='build_done')
        elif re.match(r'#\d+\s+exporting', plain):
            self.emit('log', code='build_export')
        else:
            return
        self.last_line = time.monotonic()

    def _keepalive(self):
        while not self.stop.wait(15):
            self.emit('heartbeat')

    def _send(self):
        while True:
            event = self.events.get()
            try:
                if event is None:
                    return
                payload = json.dumps(event).encode()
                delivered = False
                for attempt in range(4):
                    request = urllib.request.Request(self.endpoint, data=payload, headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json', 'User-Agent': 'Perricheno-Health-Deploy/1.0'}, method='POST')
                    try:
                        with urllib.request.urlopen(request, timeout=2) as response:
                            result = json.load(response)
                            if not result.get('ok'):
                                raise ValueError('Event rejected')
                        delivered = True
                        break
                    except urllib.error.HTTPError as error:
                        if error.code in (400, 401, 403, 409, 413):
                            break
                    except Exception:
                        pass
                    if attempt < 3:
                        time.sleep(.25 * (2 ** attempt))
                if not delivered:
                    # Do not send later sequence numbers or invent a successful finish.
                    self.enabled = False
                    print('[health] Event stream disconnected; deployment continues. Check health telemetry configuration.', file=sys.stderr)
                    return
            finally:
                self.events.task_done()
