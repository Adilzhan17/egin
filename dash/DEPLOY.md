# EGIN DASH — Deploy Guide

## 1. Install dependencies

```bash
cd dash
npm install
```

## 2. Environment variables

| Variable          | Required      | Default                            | Description                                                        |
| ----------------- | ------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `DASH_SECRET`   | **YES** | `changeme`                       | Password for the dashboard login page. Use a strong random string. |
| `DASH_PORT`     | no            | `4999`                           | Port the server listens on                                         |
| `BACKEND_URL`   | no            | `https://egin-api.perricheno.ru` | Backend API prod URL                                               |
| `FRONTEND_URL`  | no            | `https://egin.perricheno.ru`     | Frontend prod URL                                                  |
| `GIS_URL`       | no            | `http://localhost:8080`          | GIS service URL                                                    |
| `TEST_PHONE`    | no            | `+77000000001`                   | Phone number used in auth smoke tests                              |
| `TEST_PASSWORD` | no            | `test_pass_egin`                 | Password for the test account                                      |
| `TEST_TOKEN`    | no            | *(none)*                         | Static bearer token (alternative to TEST_PHONE/TEST_PASSWORD)      |
| `AUTO_RUN_MS`   | no            | `60000`                          | Auto-run interval in ms. Set to `0` to disable.                  |

Create a `.env` file or set vars in your systemd/process manager:

```bash
DASH_SECRET=your_very_strong_password_here
DASH_PORT=4999
TEST_PHONE=+77XXXXXXXXX
TEST_PASSWORD=real_test_password
```

## 3. Run

```bash
npm start
```

Dashboard is now at `http://localhost:4999`.

For production, use a process manager:

```bash
# systemd example
[Unit]
Description=Egin Dash
After=network.target

[Service]
WorkingDirectory=/opt/egin/dash
ExecStart=/usr/bin/node server.js
Restart=always
Environment=DASH_SECRET=your_very_strong_password_here
Environment=TEST_PHONE=+77XXXXXXXXX
Environment=TEST_PASSWORD=real_test_password

[Install]
WantedBy=multi-user.target
```

## 4. Cloudflare Tunnel

Point the tunnel to `localhost:4999`:

```bash
# Create the tunnel (once)
cloudflared tunnel create egin-dash

# Route the subdomain
cloudflared tunnel route dns egin-dash dash.perricheno.ru

# In your tunnel config (config.yml):
ingress:
  - hostname: dash.perricheno.ru
    service: http://localhost:4999
  - service: http_status:404
```

Run the tunnel:

```bash
cloudflared tunnel run egin-dash
```

Or as a systemd service:

```bash
cloudflared service install
```

## 5. Cloudflare Access (Zero Trust) — Layer 1

1. Open **Cloudflare Zero Trust** → **Access** → **Applications**
2. Click **Add an application** → **Self-hosted**
3. Configure:
   - **Application name**: Egin Dash
   - **Session duration**: 8 hours
   - **Application domain**: `dash.perricheno.ru`
4. Add a policy:
   - **Policy name**: Admin only
   - **Action**: Allow
   - **Rule**: Emails → `your-email@domain.com`
     *(or use GitHub/Google OAuth, or an email OTP rule for a list of allowed emails)*
5. Save. Cloudflare will now challenge any visitor before the request reaches your server.

## 6. Auth flow (two layers)

```
Browser → dash.perricheno.ru
  │
  ▼
[Cloudflare Access] ← Layer 1: OTP / OAuth (before request hits server)
  │
  ▼
[Egin Dash server] ← Layer 2: password login → HMAC-signed session cookie (8h TTL)
  │
  ▼
Dashboard UI
```

Even if someone bypasses Cloudflare (e.g. direct IP access), they still need the `DASH_SECRET` password to see anything.

## 7. Security checklist

- [ ] `DASH_SECRET` is a strong random string (not `changeme`)
- [ ] Cloudflare Access policy is active on `dash.perricheno.ru`
- [ ] Server is NOT exposed on a public IP directly (only via Cloudflare Tunnel)
- [ ] `.env` file is not committed to git (add `dash/.env` to `.gitignore`)
- [ ] `TEST_PHONE` / `TEST_PASSWORD` belong to a read-only test account, not a real user
