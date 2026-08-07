# RFP & questionnaire responder

Turn a customer questionnaire into grounded, cited draft answers — where every claim
carries a source, unsupported rows route to a human, and nothing reaches the
customer without approval.

Everyone has seen an RFP bot. The difference here is the **failure contract**: what
the app does when it _cannot_ answer. Rows with no supporting evidence render blank
and route to an SME. The API refuses to accept them. Export leaves them empty. A
fluent answer with no citation is the worst thing this app could produce, so it is
structurally prevented rather than discouraged by a prompt.

## Run it

```bash
npm install
npm run verify:fixture   # whole flow, no credentials, no network
npm start                # http://localhost:3000
```

`verify:fixture` is the interesting one to run first. It replays recorded Chat
responses and asserts the contract, so you can see the guarantees before wiring up
a token.

For live use, `cp .env.example .env` and set `GLEAN_SERVER_URL` plus your own
`GLEAN_API_TOKEN` with the `CHAT` scope.

## Auth: this app runs as you

There is no impersonation and no act-as. Your own token is the permission boundary,
which makes the app single-user — and makes the guarantee real: **content you cannot
see can never reach the customer's document.** Retrieval that returns nothing
produces a refusal, not an answer from model knowledge.

The sample corpus proves it. `sales-globex-security-questionnaire` is restricted to
the `Sample-Sales` group. Run as someone outside that group and every security row
collapses to "needs SME" instead of quietly answering from a different source.

## The flow

1. **Load and map.** Upload your own CSV, paste one, or fall back to the
   bundled sample. Prefer your own: the argument this app makes is about _your_
   evidence, and the sample drafts answers about a company that does not exist.
   Enumerate tabs, confirm which column holds the questions.
2. **Dedup and confirm.** Merge exact repeats, propose the rest, before any API call.
3. **Draft.** One Chat call per unique question, batched, progress streamed.
4. **Review.** Per row: the draft, its citations, and an evidence classification.
5. **Decide.** Accept, edit inline, regenerate with steering, or assign to an SME.
6. **Export.** Structure-preserving, behind an explicit confirm, with an approval log.
7. **Reuse.** Accepted pairs land in the answer library and pre-fill the next one.

## Two findings worth stealing

Both came out of building against a real questionnaire, and both are the kind of
thing that looks fine in a demo and fails in production.

### Lexical similarity cannot deduplicate a security questionnaire

The obvious design is to score question similarity and auto-merge above a
threshold. Measured on `fixtures/sample-security-questionnaire.csv`:

| Pair                                                                                               | Score    | Reality                          |
| -------------------------------------------------------------------------------------------------- | -------- | -------------------------------- |
| "encrypted **at rest**?" vs "encrypted **in transit**?"                                            | **0.60** | Different controls. Never merge. |
| "Is customer data encrypted at rest?" vs "Describe your at-rest encryption, including key length." | 0.29     | Same question. Should merge.     |
| "Do you support SSO via SAML 2.0?" (Security tab) vs same question (Access tab)                    | 1.00     | Same question. Safe to merge.    |

The false positive outranks the true positive, by a wide margin. The two questions
that must never be merged differ by one token; the two that should be merged share
almost no vocabulary. **No threshold works** — any cutoff that catches the real
duplicate also merges at-rest with in-transit encryption, which means telling a
customer the wrong thing about their own security controls, in writing, over your
signature.

So the app auto-merges **only** normalized-exact matches, and uses similarity
purely to _order_ a manual-merge list. The score is never a verdict. The
cross-tab exact repeat — the most common real-world case — is still handled
automatically, which is most of the value anyway.

### Topicality and approval are independent axes

The second obvious design is "cited means grounded." Consider:

> **Q:** Describe your self-service credential reset flow.
> **Cited:** "SSO and Password Reset" — an internal IT support article.

That citation is _topically excellent_. It is literally about credential resets;
term overlap scores it 0.40, comfortably "direct." It is also completely unsuitable
as evidence in a customer's security questionnaire, because it is internal
operational guidance rather than a reviewed statement of a security control.

No relevance score can catch this, because the problem isn't linguistic. So
approval is **declared, not inferred** — `lib/approved-sources.ts` holds the
prefixes cleared for customer-facing use, and the classifier scores the two axes
separately:

- **strong** — an approved source that addresses the question directly
- **weak** — on topic but internal, or approved but only adjacent. The reason
  string says which, so the reviewer knows what they are checking.
- **none** — nothing citable. No draft, route to a human.

That list is exactly the kind of thing a customer would own and review with their
security team. Putting it in a heuristic would have been the mistake.

## Refusal is enforced, not requested

`classify()` controls the answer text and citations a row may display. Rows routed
to a human must have an empty answer and no citations, even when Client Chat
returns fluent prose. The fixture suite enforces this boundary with a response
that contains a plausible answer for an unsupported attachment request.

## A failed call is not a finding

Client Chat can return HTTP 200 before a run produces a text block. Treat that as
an unfinished call, not evidence that the corpus lacks an answer. Retry once; if
the response is still unfinished, set `status: 'failed'` and `confidence: null`,
and show a retry action. Keep explicit refusals as settled answers.

## Deliberately not solved

- **Answer library ACLs.** `lib/answer-library.ts` is a JSON file. An answer library
  is a cache of retrieved content, so in a real deployment it is a way to leak
  across the permission boundary the rest of the app respects. It needs its own
  access control; here it is single-user and local.
- **Write-back.** Export only. Writing answers back into the source document needs
  the custom-tool pattern (see `first-custom-tool`), which is a separate recipe.
- **xlsx / docx input.** The parser reads CSV. Real questionnaires arrive as
  spreadsheets; adding a reader is mechanical and would pull in a dependency that
  obscures the parts of this recipe worth reading.
- **Semantic dedup.** Would need an embedding or LLM pass, which the flow rules out
  by design: dedup has to finish before the reviewer confirms and before any Chat
  call runs.

## Layout

| Path                      | What                                                           |
| ------------------------- | -------------------------------------------------------------- |
| `server.ts`               | Routes; SSE progress for the batched run                       |
| `lib/questionnaire.ts`    | CSV parse, column mapping, dedup                               |
| `lib/chat.ts`             | Client Chat call, instructions, response parsing               |
| `lib/grounding.ts`        | Evidence classification                                        |
| `lib/approved-sources.ts` | Which sources may be quoted to a customer                      |
| `lib/answer-library.ts`   | Accepted Q&A reuse                                             |
| `lib/state.ts`            | Run state and approval log                                     |
| `public/index.html`       | Review grid (safe DOM only, no `innerHTML`)                    |
| `fixtures/`               | Questionnaire input, recorded Chat responses, grounding oracle |
| `scripts/verify.mjs`      | Fixture and live verification                                  |

Tokens stay server-side; the browser only calls this app's own routes.
