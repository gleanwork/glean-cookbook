# multi-step-agent

A Glean agent that plans, retrieves, and acts through a governed custom Tool — with the graceful-denial branch demoed, not just claimed.

- **[`tool-server/`](tool-server/)** — the governed Tool: files a payments-service incident ticket, restricted to an allow-list of emails you supply.
- **[`invoke-agent/`](invoke-agent/)** — runs the agent as two different users to demo both the permitted write and the graceful fallback when the tool denies.

Build order: start `tool-server/`, expose it at a public HTTPS URL, put that origin in `tool-server/openapi.yaml`, register the specification in the Glean admin console, build the agent with that tool attached, then run `invoke-agent/`.

This server is a demo boundary, not production authorization. Its ticket action is inert, and a public caller can spoof `Glean-User-Email` unless you authenticate that the request came from Glean. Use a verified Glean request-authentication mechanism before connecting a real write action.
