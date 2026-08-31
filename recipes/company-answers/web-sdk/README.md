# Company Answers - Web SDK

Path A of the [Company Answers](https://developers.glean.com/cookbook/company-answers) recipe. Glean owns the UI. One `renderChat` call, no backend code.

## Setup

Requires Node 20.19+ or 22.12+.

```bash
npm install
npm run configure
```

`npm run configure` finds your Glean tenant from your work email and writes `VITE_GLEAN_BACKEND` into `.env.local`.

Signing in does not pick a question. Open `.env.local` and set `VITE_GLEAN_INITIAL_MESSAGE` to something you know exists in your Glean content.

## Run

```bash
npm run dev
```

Copy the exact local URL printed by Vite and open it yourself in your normal browser where you are already signed in to Glean. Do not use a private window or an agent-controlled browser. Those browsers do not share your Glean SSO session.

Confirm a cited answer renders inside Glean's chat UI.

## Contrast with Path B (`../chat-api/`)

This path ships Glean's full chat UI for free. Fastest to stand up, and you do not control the pixels. The Chat API path owns the UI and calls Glean from a small local server.
