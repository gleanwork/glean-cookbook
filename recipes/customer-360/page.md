## Problem

Account executives jump between CRM notes, renewal docs, and security
packets to prep a single customer conversation. This puts those sources on
one page per account — KPI header, parallel search tiles, journey summary,
and one-click saved prompts — so the next call needs one tab, not nine.

Everything on the page comes from what your instance already knows about
that account. Nothing is hardcoded, which also means a field stays blank
when no source supports it rather than showing a number nobody can trace.

This recipe builds the page two ways: Platform Search plus Client Chat for an
open-ended dashboard, or Agents `createRun` for a prescriptive QBR-ready brief.

## Take it further

- Add a portfolio dashboard across a rep's whole book of business, with health
  and renewal countdown tiles per account.
- Schedule a weekly headless job that re-runs the account's queries, diffs
  against the last run, and posts only what changed to Slack.
- Wire push-to-CRM / push-to-Slack actions from the journey panel once you have
  a governed custom tool.
