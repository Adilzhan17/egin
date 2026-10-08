# Live deployment reporting

`manage.py deploy` and `manage.py rollback` report deployment progress to the Health status page when telemetry is configured. No GitHub Actions run is treated as a deployment: this integration follows the real blue/green deployment script.

Configuration is loaded from environment variables or the ignored file `deploy/state/health.json`:

```json
{
  "url": "https://health.perricheno.com/api/deployments/ingest",
  "project": "egin",
  "token": "<token issued by Health admin>"
}
```

Keep the file mode `0600`. `deploy/state/` is excluded from Git **and Docker build contexts**. Environment overrides: `HEALTH_DEPLOY_URL`, `HEALTH_DEPLOY_PROJECT`, `HEALTH_DEPLOY_TOKEN`. Do not put the token in command arguments or committed source. Health admin issues a project-scoped token through `POST /api/admin/deploy-token` after PIN login; issuing a new one revokes the previous token for that project.

Deploy as usual:

```sh
python3 deploy/manage.py deploy staging
# Validate staging, then reuse exactly those images:
python3 deploy/manage.py deploy production --reuse-images TAG
```

No special deploy command and no extra process are required. Telemetry runs in a background thread. It reports preparation, API build, website build, database backup, container startup, assets, traffic switch and release verification. Reused images omit build stages. Rollbacks have their own preparation/switch/verify plan.

The public page receives curated build-step counts, cache/export events, stage transitions and final outcomes. **Raw stdout/stderr, environment variables, backup paths, command arguments and exception details are not uploaded.** Full command output still appears in the original terminal. Build progress events are sampled at most about once per second; heartbeats run every 15 seconds.

Events have a unique run ID and ordered sequence numbers. Retries preserve the same sequence number. If reporting fails, deployment continues with its original exit status and private logs. The status page labels a running stream interrupted after 90 seconds without events, rather than inventing success. A network outage can leave the public result unknown; private deployment state remains authoritative.

`status` is read-only and never produces a deployment. HTTP credentials are accepted only for localhost during tests; production reporting requires HTTPS.

Tests do not deploy containers:

```sh
python3 -m unittest discover -s deploy -p 'test_*.py'
```
