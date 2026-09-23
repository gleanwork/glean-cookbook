# Trigger a customer meeting prep request

Register a calendar/content-event Trigger through Glean's **Platform Triggers API**. When a matching customer meeting is approaching, Glean delivers one signed event to a small webhook receiver that prints a prep request.

This is the smallest useful Trigger example: discover a preset, create one trigger, verify one signed delivery, and delete the trigger. It does not use Cursor, n8n, a project tracker, or the legacy Agent-trigger surface.

## Prerequisites

- Node 22.12+
- The Triggers Platform API enabled for your tenant
- A calendar preset that advertises the `time_offset` you want, normally `GCAL_1` with 1800 seconds
- A public HTTPS URL for the receiver, such as a temporary `cloudflared` tunnel

## Setup

```bash
npm install
cp .env.example .env
npm run login
```

Set `GLEAN_TRIGGER_INPUT_TITLE` to a distinctive meeting-title substring such as `Customer QBR`. Set `GLEAN_WEBHOOK_URL` to the public URL ending in `/webhook`, and provide a bearer token that Glean will send to the receiver. The recipe uses `@gleanwork/auth` for tenant discovery and refreshable OAuth credentials stored outside the project. If `GLEAN_API_TOKEN` is set, the shared auth package uses that user-scoped token as the standard fallback.

Expose the receiver's port through a tunnel first, but do not start the receiver until after setup has saved its signing secret:

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

Put the tunnel URL plus `/webhook` in `GLEAN_WEBHOOK_URL`, set `GLEAN_TRIGGER_PRESET_ID` to a preset returned by the catalog (for example `GCAL_1`), and create the trigger:

```bash
npm run setup
```

The setup script reads `GET /api/trigger-presets` and the selected preset detail, then creates the trigger with `POST /api/triggers`. It saves the returned trigger ID and signing secret in `.env`. Start the receiver afterward so it loads the saved signing secret:

```bash
npm start
```

## Verify

Run the fixture checks without credentials:

```bash
npm run verify:fixture
```

Test the receiver locally using the same signed-delivery format without waiting for a calendar event:

```bash
npm run test:webhook
```

Then schedule one matching customer meeting far enough ahead for the selected offset. Confirm one `Customer meeting prep request` appears in the receiver output.

Clean up when finished:

```bash
npm run delete
```

Every API request carries `x-glean-include-experimental: true`, and all trigger calls use the new `/api/trigger-presets` and `/api/triggers` Platform API routes.
