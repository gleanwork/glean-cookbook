---
name: cookbook-conventions
description: Shared setup, authentication, browser handoff, documentation lookup, Web SDK sizing, and visual conventions for Glean cookbook recipes.
---

# Cookbook conventions

Apply only the authentication method declared by the selected recipe.

## Run lifecycle

For every runnable recipe: collect only the required configuration, scaffold, install, configure or authenticate, start the persistent process, wait until it is ready, and report the exact page URL as a clickable Markdown link. Leave the process running and end with one concise first action for the user.

When browser-cookie authentication applies, never open or automate the URL. The user must click it in their normal browser where their Glean session already exists. For other browser recipes, still hand the clickable URL to the user and wait for confirmation before live verification.

{{> demo-mode}}

## Web SDK SSO

{{> auth-web-sdk-cookie}}

## Client API OAuth or token

{{> auth-client-api}}

## Indexing token

{{> auth-indexing-token}}

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

{{> docs-lookup}}

## UI

{{> brand-kit}}

{{> web-sdk-sizing}}
