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

{{> demo-mode}}

## Web SDK SSO

{{> auth-web-sdk-cookie}}

## Client API OAuth or token

{{> auth-client-api}}

## Indexing token

{{> auth-indexing-token}}

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

{{> docs-lookup}}

## UI

{{> brand-kit}}

{{> web-sdk-sizing}}
