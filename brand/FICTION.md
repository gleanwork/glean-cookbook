# Acme Corp — the canon

Every recipe, complete app, mockup, and demo query in the cookbook draws from this fiction and **only** this fiction. If a recipe needs a name, a team, a customer account, or a sample query that isn't here, add it here first — don't invent it inline in a recipe.

This extends (does not replace) the "Engineering Portal" fiction already live in the dev site's Web SDK mocks (`src/components/WebSdk/mocks/demoData.ts`). Priya Natarajan and Marcus Webb are already shipped and stay exactly as they are; everything below is additive.

## Company

**Acme Corp** — internal portal at `portal.acme.internal`. A mid-size software company; the fictional company every recipe pretends to be built for.

## Departments

- **Engineering** — owns the payments platform, on-call, and the service catalog.
- **HR** — benefits, PTO policy, onboarding.
- **Sales** — account management, the Globex/Initech/Hooli relationships.
- **Finance** — budget approvals, vendor contracts (backlog-tier recipes only; no launch recipe needs Finance yet).
- **Support** — the helpdesk queue the IT-deflection recipe (no-code-it-helpdesk-lovable) answers into.

## Cast

| Name                | Role                                       | Notes                                                                                   |
| ------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| **Priya Natarajan** | Payments Platform tech lead                | Already shipped in the Web SDK mocks — do not rename.                                   |
| **Marcus Webb**     | Engineering, on-call                       | Already shipped in the Web SDK mocks — do not rename.                                   |
| **Dana Okafor**     | HR lead                                    | Owns PTO/benefits content; the no-code-pto-lookup-replit recipe's subject-matter owner. |
| **Sam Reyes**       | Account Executive, owns the Globex account | Appears in Customer 360 and RFP-responder demo material.                                |
| **Alex Kim**        | New hire, Engineering                      | The persona for the Onboarding Hub app — sees the portal for the first time.            |

Extend this table (don't replace names) if a recipe genuinely needs a new persona — e.g., an Incident Copilot on-call lead distinct from Marcus. Get a second pair of eyes before adding a new named person; the roster should stay small enough to feel like one company, not sprawl into a cast of dozens.

## Accounts (for Sales/Customer-360/RFP material)

- **Globex** — Sam Reyes's account; the primary example account for Customer 360 and RFP-responder demo data.
- **Initech** — secondary account, used when a recipe needs to show cross-account comparison or a second data point.
- **Hooli** — tertiary account, backlog-tier use only.

## Canonical demo-query pool

Draw `recipe.demo_queries` frontmatter values from this pool (or add to it — don't drift):

- "Who's on call for payments-service?"
- "What's the deploy and rollback process for payments-service?"
- "Summarize PAY-2114"
- "What's our PTO policy?"
- "How much PTO do I have left?"
- "How do I reset my SSO password?"
- "What's the status of the Globex account?"
- "Summarize my open items with Globex"
- "What onboarding steps do I still need to finish?"
- "Who owns the payments-service catalog entry?"

## The rule

Every recipe, app, and Fable mockup pulls names and queries from this file. If it's not here, it doesn't go in a recipe until it's added here — that's what keeps every example feeling like one company instead of twelve unrelated demos.

**Sign-off:** Julie Mills approves the cast/brand before any of this appears in a Go stage demo (master spec §7.3). Treat this file as a draft pending that review.
