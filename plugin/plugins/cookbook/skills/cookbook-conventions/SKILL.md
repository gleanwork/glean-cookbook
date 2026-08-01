---
name: cookbook-conventions
description: Shared Acme Corp brand kit, Web SDK embed conventions, per-recipe auth-method guidance (web-sdk-cookie, client-api-oauth-or-token, indexing-token), and live-docs lookup for Glean cookbook recipes. Apply whenever building or styling a cookbook recipe that renders a UI (Acme Answers, embedded search/chat, the engineering portal, or a Lovable/Replit no-code build), whenever a recipe asks the user for a Glean instance/token/credential, or whenever a recipe's instructions reference a Glean API/SDK detail worth confirming.
---

# Cookbook house style

Composed from `plugin/partials/` — the same fragments each recipe skill inlines directly, so a
recipe never has to send you here to learn how auth works. This skill is the browsable copy; the
partials are the source. Edit those, not this file.

## Authentication: follow the recipe's declared `authMethod`

Every recipe's registry entry declares `authMethod` — which credential category it needs. That
declaration is the source of truth for which subsection below applies; don't re-derive it from
the recipe's prose, and don't apply a subsection the recipe didn't declare. A recipe can declare
more than one value when it offers a path choice (e.g. Acme Answers' Web SDK vs. Chat API paths)
— in that case, apply whichever subsection matches the path the user picks. Recipes declaring
`none` or `custom` don't use this section at all: `none` needs no Glean credential, and `custom`
means the recipe's own instructions already fully specify a bespoke credential step (a per-agent
bearer token from a Share dialog, a token pasted into a third-party tool's secret store) —
follow that instead of inventing a detection chain it doesn't need.

### `web-sdk-cookie`

{{> auth-web-sdk-cookie}}

### `client-api-oauth-or-token`

{{> auth-client-api}}

### `indexing-token`

{{> auth-indexing-token}}

{{> docs-lookup}}

Every cookbook recipe demo represents the same fictional company, Acme Corp. Use these exact
conventions instead of approximating — a plain colored square is not the logomark, and an
unsized chat container is not "embedded."

{{> brand-kit}}

{{> web-sdk-sizing}}
