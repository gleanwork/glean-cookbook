# Pre-meeting brief with Cursor Automations

Thirty minutes before a recurring Google Calendar event, Glean sends the event to a
bearer-authenticated [Cursor Automation](https://cursor.com/docs/automations) webhook. Cursor checks
the title against an approved pattern, gathers what has moved since the group last met, and creates
or updates exactly one project update.

The window is not a fixed seven days. It starts at the marker the previous brief left behind, so the
update covers precisely the interval the group has not seen.

## Configure Cursor

At [cursor.com/automations](https://cursor.com/automations), or `/automate` in a Cursor agent
session — though not `/automate` for this one: it writes its own instructions from a plain-language
description, and the prompt shipped here is the part worth keeping.

1. Create an Automation with a **Webhook** trigger. Save it — the URL and API key only exist
   afterwards.
2. Set repository scope to **none**. This reads a tracker and writes one update; it touches no code.
3. Turn **Memories** and **Computer use** off. Both are on by default, and the delivery carries
   calendar titles, which are untrusted text. Leave the Slack and pull-request tools off too.
4. Connect the tracker over MCP — read on issues, write on project updates. Optionally connect
   **Glean MCP** for cited context on the largest changes.
5. Paste the fenced block from [`automation-prompt.md`](automation-prompt.md) and replace all three
   placeholders.
6. Run `npm run test:webhook` from this directory before registering anything with Glean. Cursor has
   no test button; the command posts one delivery so you can watch a real run.

## Register the 30-minute trigger

Copy `.env.example` to `.env`, sign in with the shipped Glean login script, and set the two Cursor values. Then run:

```bash
npm run verify:fixture   # no credentials, no network
npm run login            # OAuth via dynamic client registration
npm run preview          # what your deployment serves, and real event titles
npm run test:webhook     # one delivery to the receiver, before committing to anything
npm run setup            # registers the trigger
```

`test:webhook` exists because a webhook trigger is a private endpoint with no test button — the only
way to know the receiver accepts your token, is reachable, and can read the fields the prompt names
is to post a delivery yourself.

**It builds its title from the pattern you configured, so by default the run does the work — including
writing the update.** That is the point: a test that can only ever exit `ignored` proves the transport
and nothing else. The write is markered and idempotent, so repeating it updates that entry rather than
piling up duplicates, and the command prints what it is about to do before it does it. Pass `--ignore`
to send a deliberately non-matching title and exercise the filter instead, which reads every field and
writes nothing. Before the prompt's placeholders are filled in there is no pattern to match, so a bare
run falls back to the non-matching title and says so.

`preview` lists the presets your deployment actually serves, so you can set
`GLEAN_CALENDAR_PRESET_ID` from real data. There is deliberately no default: `GCAL_1` is what one
tenant calls "Before an event starts", and guessing an id registers the wrong events or none.
Presets are also never matched by display name — names are tenant text, and a near-miss fails
silently. What is checked instead is capability: the preset must advertise a **required
`time_offset`** offering the number of seconds you asked for.

`lib/presets.mjs` knows nothing about calendars. The datasource and lead time are settings —
`GLEAN_TRIGGER_DATASOURCE` and `GLEAN_TRIGGER_OFFSET_SECONDS`, defaulting to `googlecalendar` and
`1800` because that is what this recipe demonstrates. Point them elsewhere and the same code
registers a different kind of schedule.

Setup sends Cursor's token as `Authorization: Bearer ...` on every delivery and saves the trigger id
and one-time Glean signing secret to ignored `.env`. Copy only the token: Cursor displays the whole
header line, and Glean rejects that as not a valid bearer token — setup strips the prefix if you
paste it anyway.

It also reads whatever inputs the chosen preset requires and takes each from
`GLEAN_TRIGGER_INPUT_<FIELD>`, so the same command registers a Slack, Jira or Gong trigger.
`time_offset` is supplied for you here because that is this recipe's field.

The delivered JSON is a flat **snake_case** Glean event — `doc_id`, `title`, `event_time`,
`view_url`, and `time_offset_seconds` — with no separate calendar event-id field.

The calendar preset may fire for meetings beyond the intended project, so the Cursor prompt is a
second fail-closed filter: a non-matching title exits without reading the tracker or writing anywhere.

## Identifying the project

Paste the project URL. Linear's looks like
`linear.app/<workspace>/project/platform-weekly-a1b2c3d4e5f6/overview` and the automation takes
`a1b2c3d4e5f6` out of it.

The slug beside the id is a copy of the project name from whenever the link was made. It survives a
rename and identifies nothing, so the automation resolves by id and then confirms the resolved name
looks right before writing — the same reason the trigger setup refuses to match a preset by its
display name.

## What the two sides must agree on

Glean's delivery auth accepts **only** `BEARER` — the API rejects any other `delivery.auth.type`
outright — so Cursor has to accept the key as `Authorization: Bearer <secret>`. Cursor generates an
API key when you save a webhook automation but does not document which header it reads, so confirm
that before registering; if it expects something else, nothing here can bridge the gap.

Cursor documents no syntax for referencing the incoming request body inside an automation prompt,
which reads like a gap. It is not: the run receives the JSON and the prompt can name fields
directly. Confirmed against a real automation — `npm run test:webhook` produced a run that read
`doc_id`, `title`, `event_time`, `view_url` and `time_offset_seconds`, checked the title against the
configured pattern, and exited `ignored` before any read or write. Run it yourself rather than
trusting this; that is what the command is for.

## Verify

Schedule a matching test meeting more than 30 minutes ahead. Confirm one Cursor run and one project update covering the interval since the previous brief, with source references and the event marker. Re-deliver the same `doc_id` and `event_time` and confirm Cursor updates the existing marker instead of creating a duplicate. The occurrence key is `doc_id` **plus** `event_time`: a recurring meeting keeps one `doc_id` every week, so keying on it alone writes the brief once and never again.
