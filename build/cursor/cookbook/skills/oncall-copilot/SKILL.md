---
name: oncall-copilot
description: 'Walk through evidence-grounded incident triage on recorded runbooks and past incidents, then adapt the same gate to your corpus, with wrong-person refusal, expiry without auto-approval, a closed action registry, and a complete audit trail.'
disable-model-invocation: true
---

## Before you start

- Node 20+
- Optional live adaptation: a Glean instance with a service catalog, runbooks, and incident reviews, plus a work email for OAuth sign-in or a scoped API token

Build "On-call Copilot" following https://developers.glean.com/cookbook/oncall-copilot

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/oncall-copilot oncall-copilot
   ```

2. **Install dependencies**

   ```bash
   cd oncall-copilot && npm install
   ```

3. **Watch the governance hold, with no credentials**
   Replays recorded responses and asserts the parts that matter: the gate refuses the wrong actor, expiry escalates without executing, an unregistered action is refused, a mutating action with no supported cause is downgraded, and every attempt is audited.

   ```bash
   cd oncall-copilot && npm run verify:fixture
   ```

4. **Run it**

   ```bash
   cd oncall-copilot && npm start
   ```

   Keep the server running. Capture the exact Local URL it prints and report it as a clickable Markdown
   link. Ask the user to click the link in their normal browser and confirm the page is ready. Then give
   the first verification action.

5. **Exercise the gate**
   Fire all three sample alarms. Confirm the first cause cites a past incident, the second asserts no cause and offers an investigation ticket, the off-script agent action is refused before an approval card appears, choosing the outsider under Acting as produces an audited 403, and forcing expiry escalates without execution.
