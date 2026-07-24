# multi-step-agent / tool-server

A governed custom Tool that files Acme payments-service incident tickets — only Acme Engineering can write; anyone else gets a 403.

## Run it

```bash
pip install -r requirements.txt
python server.py
```

Then, from the Glean admin console (**Admin console → Platform → Tools → Add**), create a custom tool from scratch, upload `openapi.yaml` as its API spec, and point it at wherever you've deployed `server.py`. **Tool registration is an admin-console step, not an API call** — there's no SDK method for it.

## Verify the governance rule directly

```bash
curl -X POST http://localhost:8080/file_incident_ticket \
  -H "Glean-User-Email: dana.okafor@acme.example.com" \
  -H "Content-Type: application/json" \
  -d '{"summary": "test", "description": "test"}'
# -> 403 Not authorized

curl -X POST http://localhost:8080/file_incident_ticket \
  -H "Glean-User-Email: marcus.webb@acme.example.com" \
  -H "Content-Type: application/json" \
  -d '{"summary": "Canary alarms firing", "description": "Elevated auth failures during deploy"}'
# -> 200, { "resultURL": "https://portal.acme.internal/incidents/INC-1" }
```

## How the governance actually works

Glean forwards the identity of whichever user's context an agent run is impersonating via the `Glean-User-Email` header (the same pattern this repo's [Jira issue-creation tool guide](https://developers.glean.com/guides/tools/examples/jira-issue-creation) uses). This server checks that email against a hardcoded Acme-Engineering roster and returns `403` for anyone else — that's the enforcement point. Glean's admin UI doesn't have a built-in "restrict this custom tool to a group" toggle for scratch-built tools as of this writing, so the tool server itself is where you enforce it.
