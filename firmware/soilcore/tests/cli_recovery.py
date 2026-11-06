import json
import subprocess
import sys
import tempfile
from pathlib import Path

exe = sys.argv[1]
frame = 'READ 01 03 08 02 92 FF 9B 03 E8 00 38 57 B6\n'

with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'queue.txt'
    def run(commands):
        result = subprocess.run([exe, '--storage', str(path)], input=commands, text=True, capture_output=True, check=True)
        return [json.loads(line) for line in result.stdout.splitlines()]

    first = run('OFFLINE\n' + frame)
    assert first[1]['seq'] == 1 and first[1]['queue_count'] == 1
    after_restart = run('ONLINE\n' + frame)
    assert after_restart[0]['delivered'][0]['seq'] == 1
    assert after_restart[0]['delivered'][0]['temperature_c'] == -10.1
    assert after_restart[1]['seq'] == 2
    assert run('ONLINE\n')[0]['delivered'] == []
    owner = subprocess.Popen([exe, '--storage', str(path)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        owner.stdin.write('ONLINE\n')
        owner.stdin.flush()
        assert json.loads(owner.stdout.readline())['ok']
        competing = subprocess.run([exe, '--storage', str(path)], input='', text=True, capture_output=True)
        assert competing.returncode != 0
        other = Path(directory) / 'other.txt'
        independent = subprocess.run([exe, '--storage', str(other)], input='ONLINE\n', text=True, capture_output=True)
        assert independent.returncode == 0
    finally:
        owner.stdin.close()
        owner.wait(timeout=5)
    bad = Path(directory) / 'blocked.txt'
    Path(str(bad) + '.tmp').mkdir()
    failed_save = subprocess.run([exe, '--storage', str(bad)], input='OFFLINE\n' + frame, text=True, capture_output=True)
    assert failed_save.returncode != 0
    assert json.loads(failed_save.stdout.splitlines()[-1])['error'] == 'storage'
    path.write_text('corrupt', encoding='utf-8')
    failed = subprocess.run([exe, '--storage', str(path)], input='', text=True, capture_output=True)
    assert failed.returncode != 0
