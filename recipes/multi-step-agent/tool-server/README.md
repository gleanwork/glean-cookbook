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

Then, from the Glean admin console (**Admin console → Platform → Tools → Add**), create a custom tool from scratch, upload `openapi.yaml` as its API spec, and point it at wherever you've deployed `server.py`. **Tool registration is an admin-console step, not an API call** — there's no SDK method for it.

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

Glean forwards the identity the agent run is executing as — normally just the caller — via the `Glean-User-Email` header (the same pattern this repo's [Jira issue-creation tool guide](https://developers.glean.com/guides/tools/examples/jira-issue-creation) uses). This server checks that email against the `AUTHORIZED_EMAILS` allow-list and returns `403` for anyone else — that's the enforcement point. Glean's admin UI doesn't have a built-in "restrict this custom tool to a group" toggle for scratch-built tools as of this writing, so the tool server itself is where you enforce it.
