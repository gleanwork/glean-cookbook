# customer-360

Acme Account Journey — Sam Reyes's Globex Customer 360 page. KPI header, three source tiles, journey summary, saved-prompt buttons, and drill-in chat. Built two ways on **Platform APIs only**:

- **[`platform-search-chat/`](platform-search-chat/)** — parallel `glean.search.query` tiles + Platform Chat (`POST /api/chat`) for synthesis.
- **[`platform-agents/`](platform-agents/)** — same page UX; journey / saved prompts / follow-ups via `glean.agents.createRun`.

See the full recipe at [developers.glean.com/cookbook/customer-360](https://developers.glean.com/cookbook/customer-360) (flag-gated pre-launch) or `docs/cookbook/customer-360.mdx` in [glean-developer-site](https://github.com/gleanwork/glean-developer-site).

Spec lock: [`SPEC-LOCK.md`](SPEC-LOCK.md). Acceptance map: [`ACCEPTANCE-MAP.md`](ACCEPTANCE-MAP.md).
