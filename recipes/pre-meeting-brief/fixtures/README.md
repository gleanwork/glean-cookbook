# Fixtures

The **shape** of every fixture here was captured from a live deployment, not hand-written; the
values are synthetic. Field names are the contract the gate asserts, and those are real.

| Fixture                | Captured from                                    | Date       |
| ---------------------- | ------------------------------------------------ | ---------- |
| `presets.json`         | `GET /api/trigger-presets`                       | 2026-08-21 |
| `preset-detail.json`   | `GET /api/trigger-presets/GCAL_1`                | 2026-08-21 |
| `calendar-events.json` | `POST /api/trigger-presets/GCAL_1/events/search` | 2026-08-18 |
| `delivery.json`        | a scheduled delivery to a webhook receiver       | 2026-08-18 |

The catalog needs two fixtures because it answers in two shapes, and the difference is load-bearing.
The list carries identity only — `preset_id`, `datasource`, `display_name`, `description`. `inputs`
exist solely on the per-preset read. Code that asks a list entry for `inputs` gets `undefined`, reads
it as "this preset advertises nothing", and refuses every preset the deployment serves.

That is not hypothetical: this pair started as one fixture that stored a **per-preset body under a
list envelope**, so `presets.json` had `results: [...]` carrying `inputs`. No live response has ever
looked like that. The code read `inputs` off the list, the gate agreed with the code, and the recipe
reported "this deployment serves none" against a catalog serving twenty-two presets. Keep the two
files distinct, and keep `presets.json` free of `inputs`, or that bug comes straight back.

Which is the same lesson the camelCase payload taught: a hand-written fixture records what its author
believed the API returns, so a gate built on one can agree with the code while both disagree with
reality.

`delivery.json` is a scheduled delivery: the same event plus `event_type: CONTENT_SCHEDULE` and
`time_offset_seconds`, which `events/search` does not show because it previews the underlying
document events rather than the scheduled fire.

Event ids, titles, calendar URLs, picklist values and the request id are invented. A real capture
carries tenant meeting titles, attendee addresses and event ids, and this repository is public — the
shape is what is worth keeping, not the contents.
