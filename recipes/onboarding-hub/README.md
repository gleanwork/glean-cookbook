# onboarding-hub

Acme Corp's gamified onboarding hub for new hire Alex Kim — checklist, progress, milestone badges, and contextual Glean chat. Built two ways:

- **[`web-sdk/`](web-sdk/)** — Glean owns the chat UI via `renderChat` (SSO cookie auth).
- **[`platform-chat/`](platform-chat/)** — you own the UI; the server calls Platform Chat (`POST /api/chat`, experimental).

See the full recipe at [developers.glean.com/cookbook/onboarding-hub](https://developers.glean.com/cookbook/onboarding-hub) (flag-gated pre-launch) or `docs/cookbook/onboarding-hub.mdx` in [glean-developer-site](https://github.com/gleanwork/glean-developer-site).

Spec lock: [`SPEC-LOCK.md`](SPEC-LOCK.md). Acceptance map: [`ACCEPTANCE-MAP.md`](ACCEPTANCE-MAP.md). The M1 design prototype is kept as a review artifact outside the repo.
