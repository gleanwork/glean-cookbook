# multi-step-agent / tool-server

A governed custom Tool that files payments-service incident tickets — only emails on the allow-list you supply can write; anyone else gets a 403.

## Run it

```bash
cp .env.example .env   # set AUTHORIZED_EMAILS to real users on your instance
uv run server.py
```

`AUTHORIZED_EMAILS` is where the governance rule lives — two real emails from your own Glean instance, one that should be able to file tickets and one that shouldn't. The server refuses to start with an empty allow-list, since that would deny everyone and make the permitted branch unobservable.

Dependencies are declared inline ([PEP 723](https://peps.python.org/pep-0723/)) and locked,
so [uv](https://docs.astral.sh/uv/) installs them into an isolated environment on first run —
no `requirements.txt`, virtualenv, or activate step. Re-run `uv lock --script <script>` after
editing the inline dependencies.

## Give Glean a public HTTPS URL

Glean cannot call `localhost`. For a short-lived demo, install
[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/),
leave the server running, and start a tunnel in a second terminal:

```bash
cloudflared tunnel --url http://localhost:8080
```

Copy the printed `https://<random>.trycloudflare.com` origin. In `openapi.yaml`,
replace `https://REPLACE-WITH-YOUR-TUNNEL-HOST` with that exact origin, with no
extra path. The operation URL must resolve to:

```text
https://<random>.trycloudflare.com/file_incident_ticket
```

Confirm the public route before registering it by repeating the denied `curl`
below against the HTTPS origin. Then, in **Admin console → Platform → Tools →
Add**, create a custom tool and upload the edited `openapi.yaml`. Tool
registration is a manual admin-console step.

The quick tunnel URL changes whenever it restarts. Update and re-upload the
specification after a restart. For a durable deployment, deploy `server.py`
behind a stable HTTPS origin and use that origin in the same `servers[0].url`
field.

> **Demo security boundary:** this sample creates only in-memory fake tickets.
> A public caller can forge `Glean-User-Email`; the allow-list alone does not
> authenticate Glean. Before connecting a real ticket system, require a verified
> Glean request credential at the server or place the route behind an
> authenticated gateway that only Glean can call.

## Verify the governance rule directly

```bash
curl -X POST http://localhost:8080/file_incident_ticket \
  -H "Glean-User-Email: not-on-the-list@your-company.com" \
  -H "Content-Type: application/json" \
  -d '{"summary": "test", "description": "test"}'
# -> 403 Not authorized

curl -X POST http://localhost:8080/file_incident_ticket \
  -H "Glean-User-Email: on-the-list@your-company.com" \
  -H "Content-Type: application/json" \
  -d '{"summary": "Canary alarms firing", "description": "Elevated auth failures during deploy"}'
# -> 200, { "resultURL": "https://incidents.example.com/INC-1" }
```

## How the governance actually works

Glean forwards the acting user's identity in `Glean-User-Email`. This server
checks that value against `AUTHORIZED_EMAILS` and returns `403` for anyone else.
That is authorization only after the request itself is authenticated as coming
from Glean; the demo server intentionally does not implement that production
authentication layer.
