# Onboarding Hub — Web SDK

A first-week checklist with progress tracking and Glean chat via `renderChat`. The Web SDK uses the
identity from your existing Glean browser session; it does not need an API token.

## Setup

Requires Node 20.19+ or 22.12+.

```bash
npm install
npm run configure
cp public/steps.example.json public/steps.json
```

`npm run configure` finds your Glean tenant from your work email and writes `VITE_GLEAN_BACKEND`
into a new `.env.local`. If you skip that command, copy `.env.example` to `.env.local` and fill in
that URL yourself. It is your Glean backend, for example `https://acme-be.glean.com`.

Configuring the backend does not fill in the checklist. Copy `public/steps.example.json` to
`public/steps.json`, then replace the sample steps with your own first-week tasks. Each step needs a
unique `id`, a `title`, a `group` (`it`, `hr`, `team`, or `engineering`), a boolean `initiallyDone`,
and an `askPrompt`.

Optional completion links come from `public/resources.json`:

```bash
cp public/resources.example.json public/resources.json
```

## Run

```bash
npm run dev
```

Copy the exact local URL printed by Vite and open it in the same browser where you are already
signed in to Glean. A private or incognito window does not share that session.

## Verify

1. Confirm your checklist shows the first-week tasks you set, with groups and progress, and without
   a configuration message.
2. Ask **What should I do on my first day?** and confirm Glean returns a cited answer from your
   own onboarding documents.
3. Click **Ask about this** on a step and confirm the chat submits that step's question and answers
   it. Each click starts a fresh thread — see the note below.
4. Complete every step. Confirm the completion panel appears, then reset the demo and confirm the
   checklist and chat start fresh.

## Why "Ask about this" starts a new thread

`renderChat` returns a handle with only `on`/`off`, so there is no imperative way to send a message —
seeding one means re-mounting the widget with `initialMessage`.

That means each click starts a fresh thread. Passing `chatId` to try to continue the previous one does
not work: it makes the widget treat that chat as the selected one and look for a message in its own
frame URL instead of using `initialMessage`, so the chat visibly reloads and sends nothing. Verified
against `@gleanwork/web-sdk` 2.4.0.

If you need the history to carry, own the transcript yourself — that is what the
[Client Chat variant](../platform-chat/) does.

The Client Chat variant owns the response UI and can also show an application-level escalation state;
see [`../platform-chat/`](../platform-chat/).
