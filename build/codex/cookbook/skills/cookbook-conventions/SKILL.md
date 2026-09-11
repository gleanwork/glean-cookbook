---
name: cookbook-conventions
description: Shared setup, authentication, browser handoff, documentation lookup, Web SDK sizing, and visual conventions for Glean cookbook recipes.
---

# Cookbook conventions

Apply only the authentication method declared by the selected recipe.

## Run lifecycle

Follow the selected recipe's documented steps and execution type. Reuse supplied nonsecret
configuration and ask only for missing inputs. Do not invent prerequisites or hidden repairs.

- For a local web app, keep the server running and report its actual printed URL.
- For a CLI, run the command and report its result; do not invent a browser URL or persistent process.
- For an existing app or host configuration, use that declared interface and verify the integration or host state.
- For a hybrid service, keep only the required services running and report the current checkpoint.
- For a third-party builder, build and verify in that host, not a local substitute.

Use available authorized tools to carry out the documented verification yourself. Hand off
only actions requiring user participation or unavailable tooling. Cookie SSO is always a
user-browser handoff: do not open or automate that URL. In all paths, keep sign-in and secret
entry user-controlled. Missing access is a blocker, not a successful result.

### Select the run mode

This applies only when the selected recipe explicitly declares a presentation-demo path.
Do not infer demo support merely because this shared instruction is present. Where supported,
check whether `GLEAN_COOKBOOK_DEMO` is exactly `true` without printing environment values.

- When enabled, follow the recipe's documented sample-data command and its applicable handoff.
  Skip only configuration and authentication that the documented demo does not need. Label the
  result as a demo, not live verification.
- Otherwise, follow the normal configured path. Do not offer an undeclared or gated demo or
  silently replace live calls with sample data.

Offline fixture tests are separate from presentation demos. Run required tests in either mode;
do not suppress their failures or skip them just because demo mode is disabled.

## Web SDK SSO

No explicit credential handling — the Web SDK's default `authMethod: 'sso'` relies on the user's
existing browser session with Glean (they're already logged in, or get redirected to log in).
Don't ask for a token or walk through OAuth for this path; that's a different, unnecessary auth
model. If the recipe or user asks for server-to-server auth instead, that's a deliberate
opt-out of cookie auth into the `client-api-oauth-or-token` flow — don't blend the two.

## Client API OAuth or token

Use only the authentication path and scopes declared by the selected recipe. Run its shipped
login command when OAuth is selected; use the supported auth library for sign-in, refresh,
and credential storage. Do not assume login writes `.env`: follow the documented storage
and configuration contract. For token authentication, have the user enter the token directly
into the declared ignored environment file or host secret store, never chat or command output.
Do not implement or alter authentication while merely setting up a recipe. If the documented
path is wrong, stop and report the source defect rather than silently substituting another flow.

## Indexing token

For an indexing-token path, use the Glean-issued Indexing API token and server configuration
declared by the recipe. Do not start an unrelated Client/Platform API OAuth flow. Use the exact
variable names and secret store the recipe documents; do not assume a universal token variable
or copy configuration from a different recipe. Have the user enter secrets directly into that
store. Never request, echo, or embed the token value in conversation or commands.

## Never take a credential through the conversation

This applies to every secret a recipe needs, not only Glean's — third-party webhook keys, bot
tokens, client secrets. Ask the user to write the value straight into the recipe's declared ignored environment
file or host secret store, or use the supported auth library's sign-in and secure storage.
Then run the documented command that consumes those credentials. Do not ask them to paste it, do not echo it, and do not put it
in a command you run: the value lands in the transcript, persists on disk, and is quoted back in
summaries.

A recipe step needs the _shape_ of a credential to make progress — which header a webhook expects,
which scopes a token carries. Ask about the shape. Never the value.

If a secret does end up in the conversation, say so plainly and tell the user to rotate it rather
than letting it pass.

## Field casing differs by surface

Do not assume one convention across Glean. Two points are confirmed against live responses:

- **Platform Triggers API** (`/api/triggers`, `/api/trigger-presets`) returns **snake_case** — `doc_id`, `doc_type`, `event_time`, `event_type`, `view_url`, `trigger_id`.
- **Chat** (`/rest/api/v1/chat`) returns **camelCase** — `messageType`, `messageId`, `chatId`, `sourceDocument`.

These examples do not establish the casing for another endpoint or version. Confirm the
selected API/SDK contract in current documentation and, where authorized, its live response.
Never apply a repo-wide casing rename based on one surface. Do not make live mutations merely
to discover a response shape without authorization.

## Current API contracts

Before implementing a Glean API or SDK response shape, confirm the current supported contract.
Use this plugin's `glean-developer-docs` MCP tools when available, or another available official
documentation/SDK source. Verify scope, endpoint, field, and version support; do not infer it
from a future-looking name or another surface. Report missing evidence rather than inventing
compatibility behavior. Recipe source defines the agreed outcome, but incorrect API assumptions
must be corrected at that source, not hidden in wrappers or generated output.

## UI

For scaffolded recipes, link `/glean-cookbook.css` and compose its existing primitives: `.layout`,
`.card`, `.hero`, `.eyebrow`, `.assistant-shell`, `.assistant-header`, `.assistant-thread`,
`.assistant-composer`, `.pill`, `.note`, `.empty`, `.hit`, `.citations`, `.step`, `.msg`, `.kpi`,
and `.sdk-embed`. Use the supplied design tokens for recipe-specific CSS.

Use the asset paths supplied by the recipe; do not recreate the mark. If integrating into an
existing app, keep its design system rather than adding another global stylesheet. For a build
without scaffolded assets, follow the recipe's explicit asset setup and host conventions; do
not assume paths from a different scaffold.

Style only the surrounding page for Web SDK components. The embedded Glean UI supplies its own
branding. If the user wants their company's identity, replace the logo and accent consistently.

Keep the main interaction above the fold on desktop. Use an internal scroll region instead of
making the composer disappear below a long answer, and put the assistant before supporting panels
on mobile. Avoid debug-console layouts, oversized empty cards, and a separate answer box below the
form.

Give `renderChat`, `renderSearchBox`, and `renderSearchResults` a positioned container with explicit
width and height; 480–500px is a good default. When the experience should open directly into a cited
answer, ask the user for a topic they know exists in their Glean instance and pass that question as
`initialMessage`.
