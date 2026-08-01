# multi-step-agent / invoke-agent

Invokes the Acme incident-triage agent (built in the Glean Agent Builder, with the [governed tool](../tool-server/) attached) and demos both branches: a permitted user's tool call succeeds, a denied user's falls back gracefully.

## Prerequisite: build the agent (UI, not API)

There's no API to create an agent from scratch. In the Glean Agent Builder:

1. New agent, instructions: "You help Acme employees triage payments-service incidents. Use the incident-ticket tool to file a tracking ticket when asked. If the tool returns a 403/not-authorized error, don't fail — instead give the user a read-only summary of the incident and tell them who can file it (Acme Engineering)."
2. Turn retrieval on (grounds the summary in real incident docs from the Acme corpus).
3. Attach the [`file_incident_ticket` tool](../tool-server/) built for this recipe.
4. Copy the agent's ID from the builder URL (or `glean.client.agents.list()`).

## Run it

```bash
cp .env.example .env   # fill in GLEAN_API_TOKEN, GLEAN_INSTANCE, GLEAN_AGENT_ID
uv run main.py
```

Dependencies are declared inline ([PEP 723](https://peps.python.org/pep-0723/)) and locked,
so [uv](https://docs.astral.sh/uv/) installs them into an isolated environment on first run —
no `requirements.txt`, virtualenv, or activate step. Re-run `uv lock --script <script>` after
editing the inline dependencies.

## What this does

`glean.client.agents.run(agent_id=..., messages=[...], http_headers={"X-Glean-Act-As": ...})` — the same `X-Glean-Act-As` mechanism verified for [`permissions-aware-rag`](../../permissions-aware-rag/) runs the agent as a specific Acme user with a global/admin token. The script runs the same question twice:

- as **Marcus Webb** (Acme-Engineering) — the tool call succeeds, ticket filed
- as **Dana Okafor** (Acme-HR) — the tool server returns 403, and the agent's own instructions handle the graceful fallback

Two things worth calling out, verified against the actually installed `glean-api-client==0.15.4`, not assumed:

1. Agents use a distinct `Message`/`MessageTextBlock` model (`role`, `content: [{text, type}]`) — **not** the `ChatMessage`/`ChatMessageFragment` shape from `chat.create`.
2. `run_stream()` returns the raw SSE response as a plain `str`, not a parsed event iterator. This recipe uses `run()` (wait-for-completion) since it only needs the final messages, not live tokens.
