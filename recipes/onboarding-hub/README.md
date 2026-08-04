# onboarding-hub

A day-one checklist grounded in **your** onboarding docs — progress, milestone
badges, and contextual Glean chat. Built two ways:

- **[`web-sdk/`](web-sdk/)** — Glean owns the chat UI via `renderChat` (SSO cookie auth). Steps from `public/steps.json` or `?fixture=1`.
- **[`platform-chat/`](platform-chat/)** — you own the UI; the server calls Platform Chat (`POST /api/chat`, experimental). Steps from `GLEAN_ONBOARDING_STEPS_*` or fixture mode.

See the full recipe at [developers.glean.com/cookbook/onboarding-hub](https://developers.glean.com/cookbook/onboarding-hub) (flag-gated pre-launch) or `docs/cookbook/onboarding-hub.mdx` in [glean-developer-site](https://github.com/gleanwork/glean-developer-site).

Spec lock: [`SPEC-LOCK.md`](SPEC-LOCK.md). Acceptance map: [`ACCEPTANCE-MAP.md`](ACCEPTANCE-MAP.md).
