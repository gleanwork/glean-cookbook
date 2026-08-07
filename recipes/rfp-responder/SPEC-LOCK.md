# RFP Responder — spec lock

Parse a questionnaire, draft answers from the caller's permitted Glean content, and require human
approval before export.

## Workflow

1. Parse CSV, XLSX, or DOCX input into rows while preserving tabs, sections, and ordering.
2. Merge exact duplicate questions only. Surface near-duplicates for human review.
3. Call Client Chat once per unique question with evidence-only instructions.
4. Classify citation topicality separately from approval for external use.
5. Leave unsupported rows blank with `needs-sme` status.
6. Require explicit approval and record the approval before export.

## Contracts

- Client Chat uses `POST /rest/api/v1/chat` with the caller's credential.
- Verification sets `saveChat: false`.
- Answer text comes from `CONTENT` messages; citations come from
  `fragments[].citation.sourceDocument`.
- Every non-empty answer has at least one citation.
- Empty Chat output is a retryable transport failure, not evidence that the corpus is silent.
- Tokens remain server-side; there is no impersonation.
- Output preserves the input structure and never overwrites the source file.

## Verification

Fixture verification covers parsing, exact deduplication, strong/weak/unsupported classifications,
the refusal contract, approval, export, and unfinished Chat responses. Live verification asserts
properties that hold on any reader corpus and reports environment-specific scenarios as partial.
