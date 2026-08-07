# RFP responder fixtures

- `sample-security-questionnaire.csv` contains 20 rows across four tabs. The app reads `tab` and
  `question`; the remaining columns are the verification oracle.
- `chat-responses.json` contains Client Chat responses keyed by question id.
- `chat-unfinished.json` replaces one answer with an empty response to verify that transport
  failure is not classified as insufficient evidence.

The fixture distribution covers strong, weak, and unsupported rows. Exact duplicate questions are
merged; near-duplicates remain separate. The attachment request remains unsupported and must route
to an SME rather than receive prose.
