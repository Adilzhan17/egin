# EGIN development scope

Work on the website by default. The owner explicitly requests native Android/iOS builds only after the command «релиз» (release). Do not run APK/AAB/IPA builds or native sync during ordinary website changes. CI must not build native packages automatically on pushes or pull requests; the manual `build_native` input is reserved for an explicit release request.

Keep the phone-first layout, prominent 3D view, white and dark green palette, and safe-area spacing. Active bottom navigation changes icon/text colour, without a filled tab background.

Production uses a permanent Nginx gateway (`egin-mobile-web-1`) and blue/green application slots. Use `python3 deploy/manage.py deploy staging`, validate, then `deploy production --reuse-images TAG`. Never run `deploy/compose.yml up --build` on the live server: it recreates the gateway. That compose is for CI/local use. Keep `deploy/state/`, hashed gateway assets, and Docker data volumes. Production and staging must have separate data volumes and passkey RP origins. Only backward-compatible database migrations are compatible with the rollback workflow.

eGov integration is explicitly pending; show “В разработке” until the owner provides an approved integration and documentation. Do not present EGIN QR as eGov QR.

The developer portal lives in `apps/developers`, on `api-egin.perricheno.com` (production) and `dev-api-egin.perricheno.com` (staging). Keep its separate QR audience/session, main-app passkey verification and strict origin boundaries. External API keys must remain hashed and scoped; expose plaintext secrets only on issuance/rotation. Update `apps/api/src/catalog.json` alongside API changes and keep the route-inventory test passing. Both web apps deploy together through `deploy/manage.py`; preserve `/developer-assets/` as well as `/assets/` during blue/green switching.
