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

## Current API contracts

{{> docs-lookup}}

## UI

{{> brand-kit}}

{{> web-sdk-sizing}}
