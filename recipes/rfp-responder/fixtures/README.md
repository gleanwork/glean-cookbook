# rfp-responder fixtures

## `globex-security-questionnaire.csv`

The questionnaire input for the demo: **20 rows, 4 tabs, 3 duplicate pairs (17 unique after dedup).**

PACT-451 says this file "lives in acme-corpus" with ~20 rows. It did not exist — `acme-corpus/` is now
`examples/sample-catalog/`, and the only Globex security artifact there is a 913-byte prose _summary_.
So this fixture is authored, not extracted. See `../SPEC-LOCK.md` § Corpus reality check.

CSV is the committed source of truth because it is reviewable in a diff. The xlsx / docx / Sheet-link
input variants that step 1 of the flow requires are **generated** from it (generator not written yet —
needs an xlsx writer dependency; see Open items).

### Why the columns beyond `question` exist

`expected_grounding`, `dedup_of`, and `notes` are **test oracle**, not app input. The parser reads
`tab` + `question` only. The extra columns let `scripts/verify.mjs` assert that the app classified
every row the way the corpus actually supports, so a regression in retrieval or in the confidence
heuristic fails CI instead of silently producing confident nonsense.

When generating the xlsx/docx input, emit only `question_id` + `question` per tab. Keep the oracle here.

### Designed grounding distribution

| Grounding | Rows | Demonstrates                                                                                     |
| --------- | ---- | ------------------------------------------------------------------------------------------------ |
| `strong`  | 10   | happy path — cited, copy-paste-ready answers                                                     |
| `weak`    | 2    | the confidence flag earning its place: retrieval returned something, but only topically adjacent |
| `none`    | 8    | "needs SME" routing — the app must refuse, never fabricate                                       |

This distribution is deliberate. The confidence flag and "needs SME" assignment are called out in
PACT-451 as load-bearing parts of the pitch, and neither can be demoed on a questionnaire where every
row answers cleanly. A reviewer needs rows to triage.

### Grounding sources

Strong rows resolve against
`examples/sample-catalog/sample-data/documents/sales/sales-globex-security-questionnaire.json`, which
supports exactly six claims: SOC 2 Type II (renewed annually), AES-256 at rest, TLS 1.2+ in transit,
US-only residency, SSO/SAML, and a 24-hour breach-notification SLA. Row 7 also draws on
`engineering/eng-incident-response-runbook.json`.

Weak rows (11, 12) resolve against `support/support-sso-password-reset.json`. Note _why_ they are
weak: that document is genuinely on-topic (term overlap 0.40 for row 12 — comfortably "direct"), but
it is internal IT guidance rather than a reviewed customer-facing control statement.

This distinction drove a design change. Topicality and approval-for-external-use are independent
axes, and the first implementation of the classifier collapsed them — so it scored row 12 `strong`
and this oracle caught it. See `../SPEC-LOCK.md` § Confidence flag definition.

### Duplicate pairs

| Row | Duplicates | Kind                                                                                                  |
| --- | ---------- | ----------------------------------------------------------------------------------------------------- |
| 8   | 2          | near-duplicate, different wording ("describe your at-rest encryption" vs "is data encrypted at rest") |
| 9   | 1          | near-duplicate, adds "under NDA"                                                                      |
| 10  | 5          | **exact** duplicate on a different tab                                                                |

Row 10 is the common real-world case: the same question repeated across tabs. Row 10 also verifies
dedup works _across_ tabs, not just within one. Rows 8 and 9 require fuzzy matching, so dedup cannot be
a plain string-equality check — and per the flow, dedup happens **before** any Chat call, so getting
this right is what makes the batch 17 calls instead of 20.

### Edge case

Row 20 ("attach your most recent external vulnerability scan report") is an **evidence request**, not a
question. It must route to SME. Drafting prose here would be the single most embarrassing failure mode
for this recipe, so it is in the fixture on purpose.

### Permission-differentiated path

`sales-globex-security-questionnaire` is restricted to group `Sample-Sales`. Run as a caller outside
that group and all 10 strong rows collapse to `none` — the whole questionnaire routes to SME rather
than answering. Worth a second verify mode; it is the `permissionDifferentiated: true` demo query
pattern already used by `permissions-aware-retrieval`.

## Open items

- [ ] Generate xlsx / docx / Sheet-link variants from the CSV (needs an xlsx writer dep — `exceljs`;
      keep it a devDependency so the recipe's runtime deps stay minimal)
- [ ] Recorded Chat API responses per unique question, for fixture-mode verify without live calls
- [ ] Expected-output snapshot (answers + citations + flags) once the answer shape is settled
- [ ] Consider adding subprocessor / retention / pen-test docs to the corpus so `strong` isn't
      sourced from a single document — keep rows 13, 14, 15, 19 unanswerable regardless
