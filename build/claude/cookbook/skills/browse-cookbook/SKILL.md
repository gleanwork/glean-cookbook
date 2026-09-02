---
name: browse-cookbook
description: Use when the user asks what Glean cookbook recipes exist, wants to browse or pick a recipe to build, or asks "what can I build with Glean" — lists the available recipes and points to the matching /cookbook:{recipe-id} command.
---

# Browse the Glean cookbook

Each recipe below has a matching slash command, `/cookbook:{recipe-id}`, that guides the build
against the user's own Glean instance. Some recipes require a browser, an admin-console step, or a
handoff to another tool; keep those steps with the user. If the user names a use case rather than a recipe id (e.g.
"a Q&A page" or "an onboarding flow"), match it to the closest recipe from the list and confirm
before running its command. Full write-ups live at
[developers.glean.com/cookbook](https://developers.glean.com/cookbook/{recipe-id}).

<!-- pluginpack-generated:recipes:start -->

- **Customer 360: an account page built from your own content** (`/cookbook:customer-360`) — One page per account — status, risks, and a drill-in chat — assembled from whatever your instance already knows about that customer. No CRM export, no separate index.
- **Build an IT helpdesk page in Lovable** (`/cookbook:no-code-it-helpdesk-lovable`) — Paste a prompt into Lovable to get a private page that answers common IT questions from your Glean docs.
- **Build a PTO lookup page in Replit** (`/cookbook:no-code-pto-lookup-replit`) — Paste a prompt into Replit Agent to get a private page that answers PTO and benefits questions from your Glean docs.
- **Onboarding Hub: a day-one checklist grounded in your own docs** (`/cookbook:onboarding-hub`) — A guided first-week hub for new hires: a checklist with progress, and every step able to answer itself from your own onboarding content.
- **On-call Copilot** (`/cookbook:oncall-copilot`) — An on-call dashboard that takes an alarm to a proposed action and puts a person in front of that action. It names a cause only when a past incident backs it, turns away an approver who is neither on call nor the service owner, and escalates instead of approving itself when nobody answers. It runs on recorded incidents, so you can watch it refuse things before connecting it to anything.
- **Answer an RFP or security questionnaire** (`/cookbook:rfp-responder`) — A review app that drafts cited answers to an RFP or security questionnaire, leaves unsupported questions blank, and requires a person to approve each answer. It starts with recorded Chat responses, so you can inspect its refusal paths before connecting it to Glean.
- **Search Glean with discovered filters** (`/cookbook:search-with-discovered-filters`) — Use the official TypeScript API client to search across all of your Glean content by default, or discover datasources and common filter fields before applying an explicit selection to permission-aware Platform Search.

<!-- pluginpack-generated:recipes:end -->
