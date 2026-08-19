---
name: cookbook-conventions
description: Shared setup, authentication, browser handoff, documentation lookup, Web SDK sizing, and visual conventions for Glean cookbook recipes.
---

# Cookbook conventions

Apply only the authentication method declared by the selected recipe.

## Run lifecycle

For every runnable recipe: collect only the required configuration, scaffold, install, configure or authenticate, start the persistent process, wait until it is ready, and report the exact page URL as a clickable Markdown link. Leave the process running and end with one concise first action for the user.

When browser-cookie authentication applies, never open or automate the URL. The user must click it in their normal browser where their Glean session already exists. For other browser recipes, still hand the clickable URL to the user and wait for confirmation before live verification.

### Select the run mode

Before asking setup questions, silently check whether `GLEAN_COOKBOOK_DEMO` is exactly `true`; do
not print the environment or the variable value.

- When it is `true`, use the bundled sample-data path: skip all setup questions, authentication,
  and fixture verification output; after scaffolding and installing, run `npm run demo` and follow
  the standard browser handoff.
- Otherwise, never mention or offer demo, sample, or fixture mode. Skip the fixture-only step and
  follow the normal configured run, including its setup questions, authentication, and live
  verification.

## Web SDK SSO

No explicit credential handling — the Web SDK's default `authMethod: 'sso'` relies on the user's
existing browser session with Glean (they're already logged in, or get redirected to log in).
Don't ask for a token or walk through OAuth for this path; that's a different, unnecessary auth
model. If the recipe or user asks for server-to-server auth instead, that's a deliberate
opt-out of cookie auth into the `client-api-oauth-or-token` flow — don't blend the two.

## Client API OAuth or token

Run the scaffold's shipped login command. It discovers the tenant from the user's work email, uses
OAuth when the tenant supports it, and writes local configuration to ignored `.env`. If OAuth is
unavailable, ask the user to enter a narrowly scoped Glean API token in `.env` without exposing it in
chat or command output. Never implement or modify an authentication flow while setting up a recipe.

## Indexing token

Indexing API operations accept Glean-issued tokens only — OAuth does not apply here regardless of
tenant configuration (per developers.glean.com/api-info/client/authentication/oauth). Don't run an
OAuth detection chain for an indexing recipe; go straight to asking for a Glean
Indexing API token (`GLEAN_INDEXING_API_TOKEN`) and server URL (`GLEAN_SERVER_URL`), the same way
`index-custom-source` already does.

## Never take a credential through the conversation

This applies to every secret a recipe needs, not only Glean's — third-party webhook keys, bot
tokens, client secrets. Ask the user to write the value straight into the recipe's ignored `.env`,
then run the command that reads it. Do not ask them to paste it, do not echo it, and do not put it
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

Anything else is unconfirmed, so read a real response before writing field names, and never apply a repo-wide rename in either direction — it will break whichever surface it was not written for.

## Current API contracts

Before implementing a Glean API or SDK response shape, confirm the current contract with this
plugin's `glean-developer-docs` MCP server (`docs_search`, then `docs_fetch`). Follow current
deprecation notices. Recipe reference text defines intent and recipe-specific constraints; official
documentation defines endpoint and field details.

## UI

For scaffolded recipes, link `/glean-cookbook.css` and compose its existing primitives: `.layout`,
`.card`, `.hero`, `.eyebrow`, `.assistant-shell`, `.assistant-header`, `.assistant-thread`,
`.assistant-composer`, `.pill`, `.note`, `.empty`, `.hit`, `.citations`, `.step`, `.msg`, `.kpi`,
and `.sdk-embed`. Use the supplied design tokens for recipe-specific CSS.

Use `public/glean-logomark.svg`; do not recreate the mark. For a build without scaffolded assets,
copy the tokens and mark from `https://github.com/gleanwork/glean-cookbook/tree/main/brand`.

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
