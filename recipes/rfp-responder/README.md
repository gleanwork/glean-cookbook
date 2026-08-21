# RFP and questionnaire responder

A review app that drafts cited answers to an RFP or security questionnaire,
leaves unsupported questions blank, and requires a person to approve each
answer.

The default walkthrough uses a sample questionnaire and recorded Chat
responses. You can inspect every evidence path before connecting the app to
Glean.

## Run it

You need Node 20 or newer, and nothing else. The walkthrough needs no
credentials and makes no network calls.

```bash
npm install
npm run verify:fixture
npm start
```

`verify:fixture` runs the questionnaire from the command line and checks the
evidence and approval rules. `npm start` prints a Local URL where you can walk
through the same sample in a browser.

## Three things to try

**Draft the bundled questionnaire.** Click **Try the bundled sample**, then
**Confirm and draft answers**. The app parses 20 rows across four tabs, merges
one exact duplicate, and asks 19 questions. The review summary shows 10 strongly
grounded answers, two weak answers to verify, and eight questions that need a
subject matter expert.

**Inspect an unsupported question.** Find ACC-04 or CMP-01. The row stays blank,
has no citations, and offers assignment to a subject matter expert.

**Compare strong and weak evidence.** SEC-01 and SEC-02 have cited drafts backed
by approved sources. ACC-02 and ACC-03 have drafts but stay in the weak evidence
bucket. Each row says why its evidence needs review.

## Point it at your own content

Live mode calls Client Chat with your credential. It also needs a reviewed list
of document URL prefixes that may support customer-facing answers. Do not use
the sample questionnaire to test your company content. Its questions and
recorded answers describe a company that does not exist.

1. Copy `.env.example` to `.env`.
2. Run the login flow:

   ```bash
   npm run login -- --email "you@company.com"
   ```

3. Set `RFP_APPROVED_SOURCE_PREFIXES` in `.env` to a comma-separated list of
   Glean document URL prefixes that your team has cleared for customer-facing
   use.
4. Start live mode:

   ```bash
   npm run start:live
   ```

5. Open the printed Local URL and upload a questionnaire your own content can
   answer.

There is no impersonation or act-as behavior. Your token is the permission
boundary. Content you cannot see cannot reach a draft. Run the same
questionnaire separately as two people to check how their access changes the
results.

## How the review flow works

1. Upload or paste a CSV. The bundled sample is available for the recorded
   walkthrough.
2. Confirm the detected columns. Exact repeats merge before any Chat call.
3. Draft one answer per unique question.
4. Review the answer, its citations, and its evidence classification.
5. Accept the answer, edit it, regenerate it with an instruction, or assign the
   question to a subject matter expert.
6. Confirm the export. Unaccepted rows remain blank.
7. Reuse accepted answers from the local answer library on the next run.

## Why similarity does not decide duplicates

A wording score cannot safely merge a security questionnaire. Measured on
`fixtures/sample-security-questionnaire.csv`:

| Pair                                                                                               | Score    | Result                            |
| -------------------------------------------------------------------------------------------------- | -------- | --------------------------------- |
| "Is customer data encrypted **at rest**?" vs "Is customer data encrypted **in transit**?"          | **0.60** | Different controls. Do not merge. |
| "Is customer data encrypted at rest?" vs "Describe your at-rest encryption, including key length." | 0.29     | Same question. Review for merge.  |
| "Do you support SSO via SAML 2.0?" on two tabs                                                      | 1.00     | Exact duplicate. Safe to merge.   |

The false match scores higher than the true match. No threshold separates the
two. The app therefore merges only normalized exact matches. Similarity orders
possible repeats for review but never decides the merge.

## Why relevance does not grant approval

A citation can discuss the right topic and still be wrong for a customer
response. An internal password-reset article might answer a credential-reset
question, but it is operational guidance rather than a reviewed statement of a
security control.

`lib/approved-sources.ts` keeps approval separate from relevance:

- **strong** means an approved source addresses the question directly.
- **weak** means the source is on topic but internal, or approved but adjacent.
  The row explains which case applies.
- **none** means there is nothing citable. The app leaves the answer blank and
  routes the question to a subject matter expert.

Approval is declared through reviewed URL prefixes. The app does not infer it
from wording.

## Boundaries to address before deployment

- **Answer library access.** `lib/answer-library.ts` stores accepted answers in
  a local JSON file. Add access control before sharing the library across a
  team, because it caches retrieved content.
- **Write-back.** The app exports a CSV. Writing to the source document requires
  a separate integration with the same confirmation and approval log.
- **Spreadsheet input.** The parser reads CSV. Add xlsx or docx support for
  questionnaires that arrive in those formats.
- **Semantic deduplication.** The app does not merge paraphrased questions.
  Doing that safely requires a separate review interaction.

## Layout

| Path                      | What it contains                                                |
| ------------------------- | --------------------------------------------------------------- |
| `server.ts`               | Routes and streamed progress for the drafting run               |
| `lib/questionnaire.ts`    | CSV parsing, column mapping, and exact deduplication             |
| `lib/chat.ts`             | Client Chat request and response parsing                        |
| `lib/grounding.ts`        | Evidence classification                                         |
| `lib/approved-sources.ts` | Sources cleared for customer-facing answers                     |
| `lib/answer-library.ts`   | Local reuse of accepted answers                                 |
| `lib/state.ts`            | Run state and approval log                                      |
| `public/index.html`       | Browser review app                                              |
| `fixtures/`               | Sample input, recorded responses, and the grounding oracle      |
| `scripts/verify.mjs`      | Fixture and live verification                                   |

Tokens stay on the server. The browser calls only this app's routes.
