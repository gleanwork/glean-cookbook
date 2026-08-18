# Gong call follow-up fixtures

- `delivery.json` — one delivery exactly as the Glean Trigger node emits it: the parsed body, no
  headers. The node verifies the signature and calls `getBodyData()`, so `webhook-id` never reaches
  the workflow and cannot be the idempotency key.
- `chat-response.json` — a Client Chat response carrying an `UPDATE` progress message, two distinct
  citations, and a repeat of one of them, so parsing has to drop narration and deduplicate.
- `chat-unfinished.json` — a 200 whose only `CONTENT` message has empty text. This is a transport
  failure, not an empty call.
- `accounts.json` — Salesforce accounts including `Acme Corp` and `Acme Corporation`: two real
  accounts with different owners that every workable name normalization collapses together.
- `channels.json` — the account-to-channel map. `Umbrella Ltd` is deliberately absent so the
  unmapped path is exercised.

The gate executes the Code nodes from `workflow.json` against these, so the fixtures verify the
artifact that ships rather than a parallel copy of its logic.
