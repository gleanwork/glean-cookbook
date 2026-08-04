---
name: browse-cookbook
description: Use when the user asks what Glean cookbook recipes exist, wants to browse or pick a recipe to build, or asks "what can I build with Glean" — lists the available recipes and points to the matching /cookbook:{recipe-id} command.
---

# Browse the Glean cookbook

Each recipe below has a matching slash command, `/cookbook:{recipe-id}`, that builds it hands-free
against the user's own Glean instance. If the user names a use case rather than a recipe id (e.g.
"a Q&A page" or "an onboarding flow"), match it to the closest recipe from the list and confirm
before running its command. Full write-ups live at
[developers.glean.com/cookbook](https://developers.glean.com/cookbook/{recipe-id}).

<!-- pluginpack-generated:recipes:start -->

- **Call a Glean agent from an A2A client** (`/cookbook:a2a-client`) — Discover a published Glean agent's A2A card and run it from any A2A client — multi-turn, streamed, permission-aware.
- **Build an engineering portal** (`/cookbook:build-engineering-portal`) — The end-to-end showcase — index a developer catalog into Glean, then embed permission-aware search and chat back into the portal your team already uses.
- **Company Answers: a cited Q&A page on your own content** (`/cookbook:company-answers`) — The hello-world of Glean apps: one page, one input, one permission-aware cited answer — built two ways, with the Web SDK and with the Chat API.
- **Connect Glean MCP to your AI tools** (`/cookbook:connect-mcp-hosts`) — Point Claude Code, Cursor, and Claude Desktop at your Glean MCP endpoint and run one enterprise task from each — same context, three surfaces.
- **Customer 360: an account page built from your own content** (`/cookbook:customer-360`) — One page per account — status, risks, and a drill-in chat — assembled from whatever your instance already knows about that customer. No CRM export, no separate index.
- **Embed search & chat in an internal app** (`/cookbook:embed-search-chat`) — Put permission-aware Glean search and chat directly inside an internal app with the Web SDK, so your team gets answers where they already work.
- **On-call copilot with a real approval gate** (`/cookbook:incident-copilot`) — Triage an incident from your own runbooks and past incidents, propose one pre-registered action, and let a human approve it — where the gate refuses the wrong person, expiry escalates instead of auto-approving, and every attempt is audited.
- **Multi-step agent with governed tools** (`/cookbook:multi-step-agent`) — Build a Glean agent that plans, retrieves, and acts through a governed custom tool — with a safe fallback when the tool is denied.
- **IT helpdesk deflection page — no code, on Lovable** (`/cookbook:no-code-it-helpdesk-lovable`) — Prompt Lovable into an IT helpdesk deflection page on the Glean Chat API — zero hand-written backend, permissions enforced by Glean.
- **PTO & benefits lookup — no code, on Replit** (`/cookbook:no-code-pto-lookup-replit`) — Prompt Replit Agent into a working HR lookup tool on the Glean Chat API — zero hand-written backend, permissions enforced by Glean.
- **Onboarding Hub: a day-one checklist grounded in your own docs** (`/cookbook:onboarding-hub`) — A guided first-week hub for new hires: a checklist with progress, and every step able to answer itself from your own onboarding content.
- **Ground your own LLM app in Glean** (`/cookbook:permissions-aware-retrieval`) — Use Glean's Platform API as the retrieval layer for your own LLM app — every result ACL-filtered for the caller before it ever reaches the model.
- **Answer an RFP or security questionnaire** (`/cookbook:rfp-responder`) — Turn a customer questionnaire into grounded, cited draft answers — where every claim carries a source, unsupported rows route to a human, and nothing reaches the customer without approval.

<!-- pluginpack-generated:recipes:end -->
