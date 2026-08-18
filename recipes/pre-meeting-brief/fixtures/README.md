# Fixtures

The **shape** of `presets.json` and `calendar-events.json` was captured from a live deployment, not
hand-written; the values are synthetic. Field names are the contract the gate asserts, and those are
real:
`GET /api/trigger-presets/GCAL_1` and `POST /api/trigger-presets/GCAL_1/events/search`, 2026-08-18.

That matters. A hand-written fixture records what its author believed the API returns, so a gate
built on one can agree with the code while both disagree with reality — which is how this recipe
came to document a camelCase payload the API has never sent.

`delivery.json` is a scheduled delivery: the same event plus `event_type: CONTENT_SCHEDULE` and
`time_offset_seconds`, which `events/search` does not show because it previews the underlying
document events rather than the scheduled fire.

Event ids, titles and calendar URLs are invented. A real capture carries tenant meeting titles and
event ids, and this repository is public — the shape is what is worth keeping, not the contents.
