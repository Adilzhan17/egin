"""Verify generated reverse-proxy routing and container build without deployment."""
import sys
import types
import unittest
from pathlib import Path

if sys.platform == 'win32':
    sys.modules.setdefault('fcntl', types.ModuleType('fcntl'))
import manage


class SoilCoreDeploymentTests(unittest.TestCase):
    def test_gateway_upgrade_targets_active_web_slot_only(self):
        slot = {'slot': 'blue', 'release': 'test-release'}
        app = manage.server('staging', slot)
        self.assertIn('location = /api/soilcore/ws', app)
        self.assertIn('proxy_pass http://egin-staging-blue-web-1:4934;', app)
        self.assertIn('proxy_http_version 1.1;', app)
        self.assertIn('proxy_set_header Upgrade $http_upgrade;', app)
        self.assertIn('proxy_set_header Connection "upgrade";', app)
        self.assertNotIn('location = /api/soilcore/ws', manage.server('staging', slot, True))

    def test_container_builds_native_cli_in_alpine_and_copies_runtime(self):
        dockerfile = (Path(__file__).parent / 'Api.Dockerfile').read_text()
        self.assertIn('FROM node:22-alpine AS soilcore-build', dockerfile)
        self.assertIn('ctest --test-dir build --output-on-failure', dockerfile)
        self.assertIn('COPY --from=soilcore-build /build/build/soilcore_cli', dockerfile)
        self.assertIn('libstdc++', dockerfile)
        self.assertIn('SOILCORE_CLI=/usr/local/bin/soilcore_cli', dockerfile)


if __name__ == '__main__':
    unittest.main()
