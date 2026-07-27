---
name: cookbook-conventions
description: Shared Acme Corp brand kit, Web SDK embed conventions, OAuth-vs-token auth detection, and live-docs lookup for Glean cookbook recipes. Apply whenever building or styling a cookbook recipe that renders a UI (Acme Answers, embedded search/chat, the engineering portal, or a Lovable/Replit no-code build), whenever a recipe asks the user for a Glean instance/token/credential, or whenever a recipe's instructions reference a Glean API/SDK detail worth confirming.
---

# Cookbook house style

## Authentication: OAuth first, token as fallback — detect, don't assume

Some Glean deployments don't have OAuth enabled, so don't assume either direction. Resolve it
instead of guessing, using the same chain a real user's own instance is discoverable through:

1. Ask for the user's work email — not a raw backend URL. Resolve their tenant with:
   ```
   POST https://app.glean.com/config/search
   Content-Type: application/json

   {"email": "<their email>"}
   ```
   Response: `{"search_config": {"queryURL": "https://{instance}.askscio.com/", ...}}`. Extract
   `{instance}` from the subdomain of `queryURL`.
2. The real Client API backend is `https://{instance}-be.glean.com` — verified live: for a
   `glean.com` email this resolves `queryURL` to `scio-prod.askscio.com`, and
   `https://scio-prod-be.glean.com` is a real, reachable backend; same pattern confirmed for at
   least one real customer domain.
3. `GET {backend}/.well-known/oauth-authorization-server`. A 200 means OAuth is configured —
   use `authorization_code` + PKCE (verified live against `scio-prod-be.glean.com`: this is the
   grant Glean's own docs call "the recommended authentication method for Client API
   integrations," and what MCP hosts already use for their own sign-in flow). Do **not** use
   `client_credentials` even though it appears in `grant_types_supported` — a general
   client-credentials/service-account flow for the Client API is explicitly not yet a supported
   path for this kind of integration.
4. A 404 (or any failure) on that endpoint means OAuth isn't available for this instance — fall
   back to asking for an API token with the scope the recipe needs, the same way recipes already
   do when OAuth genuinely isn't an option.

## Verify API details against live docs

This plugin ships the `glean-developer-docs` MCP server (`docs_search`, `docs_fetch`) —
`developers.glean.com`'s own documentation, always current. A recipe's instructions describe
_what_ to build and call out gotchas that aren't in the docs (deprecated classes, footguns in
bundled SDK examples, exact field names that are easy to get wrong); they don't restate every
method signature or response shape. When you need that level of detail, or the recipe's
instructions seem to disagree with the SDK version you actually have installed, use
`docs_search`/`docs_fetch` to confirm rather than guessing — that's what the server is for.

Every cookbook recipe demo represents the same fictional company, Acme Corp. Use these exact
conventions instead of approximating — a plain colored square is not the logomark, and an
unsized chat container is not "embedded."

## Brand kit

Primary accent: `#0E8C84` (teal). Use this for the primary button, header accent, or active
state — not Glean's own blue.

Use the real logomark, not a colored `<div>`/`<span>`. For light backgrounds:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Acme Corp">
  <title>Acme Corp</title>
  <rect x="0" y="0" width="64" height="64" rx="18" fill="#0E8C84"></rect>
  <path fill-rule="evenodd" fill="#ffffff" d="M32 13 L55 52 L9 52 Z M32 29 L43 46 L21 46 Z"></path>
</svg>
```

For dark backgrounds/dark mode:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Acme Corp">
  <title>Acme Corp</title>
  <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="17.5" fill="#12B3A6" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"></rect>
  <path fill-rule="evenodd" fill="#0A1615" d="M32 13 L55 52 L9 52 Z M32 29 L43 46 L21 46 Z"></path>
</svg>
```

Inline either `<svg>` directly, or save it as `logo.svg` and reference it — do not recreate the
mark from a text description. If you have filesystem/network access to the private
`gleanwork/glean-cookbook` repo, the canonical files are `brand/logomark-light.svg`,
`brand/logomark-dark.svg`, and `brand/tokens.json` (full color/type tokens); otherwise the SVGs
above are the complete, self-contained source.

## Web SDK embed sizing

`renderChat`/`renderSearchBox`/`renderSearchResults` need an explicit-sized container
(`position: relative`, `display: block`, a real `width`, a real `height`) or the widget won't
render at all. Beyond that minimum:

- **Height**: 480–500px reads as a properly-proportioned embedded panel. Taller containers
  (560px+) leave visible dead space below Glean's own chat landing view, which is a fixed-height
  hero, not something that stretches to fill its container.
- **First paint**: pass `initialMessage` (a `ChatOptions` field) with the recipe's own first demo
  query, e.g. `renderChat(el, { initialMessage: "What's our PTO policy?" })`. This opens straight
  into a real, cited answer instead of an empty "Ask Assistant anything" landing screen — a much
  better first impression, and it doubles as an on-load verification that the integration works.
