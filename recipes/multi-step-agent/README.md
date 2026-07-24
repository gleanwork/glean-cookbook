# multi-step-agent

A Glean agent that plans, retrieves, and acts through a governed custom Tool — with the graceful-denial branch demoed, not just claimed.

- **[`tool-server/`](tool-server/)** — the governed Tool: files an Acme payments-service incident ticket, restricted to Acme-Engineering.
- **[`invoke-agent/`](invoke-agent/)** — runs the agent as two different users to demo both the permitted write and the graceful fallback when the tool denies.

Build order: stand up `tool-server/`, register it in the Glean admin console (Tools → Add → upload `tool-server/openapi.yaml`), build the agent in the Agent Builder with that tool attached, then run `invoke-agent/`.
