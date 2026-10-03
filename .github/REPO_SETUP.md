# Repository checks

`ci-cd.yml` validates the current `apps/web` + `apps/api` + PostGIS stack. It has read-only repository permissions and no automatic deployment. Old Nest/Go/Cloudflare deployment workflows were removed when those services were consolidated. Production deployment requires an explicit environment configuration and a separately reviewed deployment workflow.

Local setup, demo credentials and provider configuration are in the root README; testing details are in `docs/TESTING.md`.
