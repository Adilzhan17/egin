import unittest
from autodeploy import checks_pass, REQUIRED


class CheckGateTests(unittest.TestCase):
    def runs(self):
        return [dict(name=name, head_sha='abc', event='push', run_number=1, run_attempt=1, status='completed', conclusion='success') for name in REQUIRED]

    def test_all_required_workflows_must_pass_on_exact_push(self):
        runs = self.runs()
        self.assertTrue(checks_pass(runs, 'abc'))
        self.assertFalse(checks_pass(runs[:-1], 'abc'))
        self.assertFalse(checks_pass(runs, 'other'))
        runs[0]['event'] = 'pull_request'
        self.assertFalse(checks_pass(runs, 'abc'))

    def test_latest_failure_or_pending_blocks_even_if_older_run_passed(self):
        for status, conclusion in [('completed', 'failure'), ('in_progress', None)]:
            runs = self.runs()
            runs.append({**runs[0], 'run_number': 2, 'status': status, 'conclusion': conclusion})
            self.assertFalse(checks_pass(runs, 'abc'))

    def test_successful_rerun_supersedes_previous_failure(self):
        runs = self.runs()
        runs[0]['conclusion'] = 'failure'
        runs.append({**runs[0], 'run_attempt': 2, 'conclusion': 'success'})
        self.assertTrue(checks_pass(runs, 'abc'))
