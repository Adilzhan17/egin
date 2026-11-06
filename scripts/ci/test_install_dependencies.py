import subprocess
from contextlib import redirect_stdout
from io import StringIO
import tempfile
from pathlib import Path
from types import SimpleNamespace
import unittest

from install_dependencies import install, missing_packages


class DependencyRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(redirect_stdout(StringIO()))
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.commands = []
        self.mirrors = []
        self.download_codes = iter([0])
        self.update_codes = iter([0])
        self.install_error = False
        self.elapsed = 0

    def run_command(self, args, **kwargs):
        self.commands.append(args)
        if args[0] == 'node':
            return SimpleNamespace(returncode=1, stdout='Missing system dependencies (2):\n  libfoo1\n  libbar2\n', stderr='')
        if args[-1] == 'update':
            self.mirrors.append(Path(self.directory.name, 'ubuntu.list').read_text())
            return SimpleNamespace(returncode=next(self.update_codes))
        if '--download-only' in args:
            return SimpleNamespace(returncode=next(self.download_codes))
        if self.install_error:
            raise subprocess.CalledProcessError(100, args)
        return SimpleNamespace(returncode=0)

    def execute(self, **kwargs):
        install(self.directory.name, run=self.run_command, clock=lambda: self.elapsed, **kwargs)

    def test_success_installs_only_after_authenticated_download(self):
        self.execute(media=True)
        self.assertEqual(len(self.commands), 4)
        download, offline = self.commands[-2:]
        self.assertIn('--download-only', download)
        self.assertIn('--no-download', offline)
        self.assertNotIn('timeout', offline)
        for package in ['libfoo1', 'libbar2', 'ffmpeg', 'qpdf']:
            self.assertIn(package, download)
            self.assertIn(package, offline)

    def test_slow_package_download_fails_over_without_running_dpkg(self):
        self.update_codes = iter([0, 0])
        self.download_codes = iter([124, 0])
        self.execute()
        self.assertIn('https://archive.ubuntu.com/ubuntu', self.mirrors[0])
        self.assertIn('https://azure.archive.ubuntu.com/ubuntu', self.mirrors[1])
        self.assertEqual(sum('--no-download' in command for command in self.commands), 1)
        self.assertIn('--no-download', self.commands[-1])

    def test_index_failure_uses_other_mirror_before_resolving_packages(self):
        self.update_codes = iter([100, 0])
        self.execute()
        self.assertEqual(self.commands[1][-1], 'update')
        self.assertEqual(len(self.mirrors), 2)

    def test_both_mirrors_failing_is_a_real_failure(self):
        self.update_codes = iter([0, 0])
        self.download_codes = iter([124, 100])
        with self.assertRaisesRegex(RuntimeError, 'Both Ubuntu mirrors failed'):
            self.execute()
        self.assertFalse(any('--no-download' in c for c in self.commands))

    def test_offline_install_failure_is_not_retried_or_hidden(self):
        self.install_error = True
        with self.assertRaises(subprocess.CalledProcessError):
            self.execute()
        self.assertEqual(len(self.mirrors), 1)

    def test_index_and_packages_share_one_network_budget(self):
        def run(args, **kwargs):
            result = self.run_command(args, **kwargs)
            if args[-1] == 'update':
                self.elapsed += 50
            return result
        install(self.directory.name, run=run, clock=lambda: self.elapsed)
        self.assertIn('60s', self.commands[0])
        self.assertIn('160s', self.commands[2])

    def test_sources_keep_signature_verification_and_exclude_unrelated_repos(self):
        self.execute()
        self.assertIn('signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg', self.mirrors[0])
        self.assertIn('noble-security', self.mirrors[0])
        config = Path(self.directory.name, 'apt.conf').read_text()
        self.assertIn('Acquire::https::Timeout "20"', config)
        self.assertIn('Dir::Etc::sourceparts "-"', config)
        self.assertNotIn('AllowUnauthenticated', config)

    def test_installed_dependencies_need_no_apt_install(self):
        def run(args, **kwargs):
            if args[0] == 'node':
                return SimpleNamespace(returncode=0, stdout='All system dependencies are installed.\n', stderr='')
            return self.run_command(args, **kwargs)
        install(self.directory.name, run=run, clock=lambda: 0)
        self.assertEqual(len(self.commands), 1)

    def test_invalid_or_changed_cli_report_fails_closed(self):
        for code, report in [(0, ''), (1, 'apt-get failed'), (1, 'Missing system dependencies (2):\n libfoo'),
                             (1, 'Missing system dependencies (1):\n --allow-unauthenticated')]:
            with self.subTest(report=report), self.assertRaises(RuntimeError):
                missing_packages(SimpleNamespace(returncode=code, stdout=report, stderr='fixture error'))


if __name__ == '__main__':
    unittest.main()
