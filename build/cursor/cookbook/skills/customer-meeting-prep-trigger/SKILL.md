---
name: customer-meeting-prep-trigger
description: 'Register a calendar Trigger through the Platform Triggers API and deliver one signed event to a small receiver that prints a customer-meeting prep request.'
disable-model-invocation: true
---

## Before you start

- Node 22.12 or newer
- The Platform Triggers API enabled for the tenant
- A calendar trigger preset that advertises a time_offset, normally GCAL_1
- A public HTTPS URL for the receiver, such as a temporary cloudflared tunnel
- A bearer token that Glean may send to the receiver

Build "Trigger a customer meeting prep request" following https://developers.glean.com/cookbook/customer-meeting-prep-trigger

### Select the run mode

This applies only when the selected recipe explicitly declares a presentation-demo path.
Do not infer demo support merely because this shared instruction is present. Where supported,
check whether `GLEAN_COOKBOOK_DEMO` is exactly `true` without printing environment values.

- When enabled, follow the recipe's documented sample-data command and its applicable handoff.
  Skip only configuration and authentication that the documented demo does not need. Label the
  result as a demo, not live verification.
- Otherwise, follow the normal configured path. Do not offer an undeclared or gated demo or
  silently replace live calls with sample data.

Offline fixture tests are separate from presentation demos. Run required tests in either mode;
do not suppress their failures or skip them just because demo mode is disabled.

Use nonsecret inputs the user already supplied. Ask only for missing information needed by the
selected recipe path, resolving dependent choices before continuing. Do not request credential
values in conversation; use the recipe's documented secure sign-in or secret-entry path. Required
questions for this recipe are:

- What is your work email? It is used once to discover your Glean tenant.
- What distinctive meeting-title substring should trigger prep, such as Customer QBR?
- What public HTTPS URL ending in /webhook should receive the signed event?

Follow the selected authentication path. If OAuth is selected, run the recipe's shipped login
command with its declared scopes. If the documented token path is selected, skip OAuth login
and use that path's declared secure configuration. Keep sign-in and secret entry user-controlled.
Do not implement or alter OAuth while setting up the recipe, and do not silently substitute a
path when the documented one fails.

1. **Scaffold the recipe**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/customer-meeting-prep-trigger customer-meeting-prep-trigger
   ```

2. **Install dependencies**
   This recipe uses Node's built-in HTTP server and fetch; there is no external automation platform or downstream write dependency.

   ```bash
   cd customer-meeting-prep-trigger && npm install
   ```

3. **Run the fixture verification**
   Verify preset selection, experimental Platform API headers, input resolution, and Standard Webhooks signing before connecting a tenant.

   ```bash
   cd customer-meeting-prep-trigger && npm run verify:fixture
   ```

4. **Sign in to Glean**
   Use @gleanwork/auth for tenant discovery and refreshable OAuth credentials stored outside the project. If OAuth is unavailable, provide a user-scoped token with the Triggers permission as a CI fallback.

   ```bash
   cd customer-meeting-prep-trigger && npm run login -- --email "<work-email>"
   ```

5. **Configure the meeting pattern and receiver**
   Set GLEAN_TRIGGER_INPUT_TITLE to a distinctive title substring such as Customer QBR, choose the preset ID returned by the catalog, and set GLEAN_WEBHOOK_URL to a public HTTPS URL ending in /webhook. Set a bearer token that the receiver will accept.

6. **Start and expose the receiver**
   The receiver listens on loopback, verifies bearer delivery auth and the Standard Webhooks signature, and prints a prep request for matching meeting titles. Expose /webhook through a public HTTPS tunnel before registering the trigger.

   ```bash
   cd customer-meeting-prep-trigger && npm start
   ```

   Keep required services and tunnels running. Report the current checkpoint and any exact endpoint
   printed. Then give the next manual or verification action.

7. **Register the Platform Trigger**
   Setup reads GET /api/trigger-presets and the selected preset detail, then creates one trigger through POST /api/triggers. It saves the returned trigger ID and signing secret locally.

   ```bash
   cd customer-meeting-prep-trigger && npm run setup
   ```

8. **Test one signed delivery**
   Send one fixture delivery through the same signed webhook contract without waiting for a calendar event. Then schedule one real matching meeting to verify forward delivery from the Platform Trigger.

   ```bash
   cd customer-meeting-prep-trigger && npm run test:webhook
   ```

9. **Delete the trigger**
   Delete only the trigger ID created by this recipe and clear the local signing secret.
   ```bash
   cd customer-meeting-prep-trigger && npm run delete
   ```
