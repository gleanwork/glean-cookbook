# Company Answers

The hello-world of Glean apps: one page, one input, one permission-aware cited answer. Built two ways so you can pick the trade-off that fits.

- **[web-sdk/](web-sdk/)** - Glean owns the UI. One `renderChat` call.
- **[chat-api/](chat-api/)** - you own the UI. Platform Chat from a small local server.

The Platform Chat path records a first run you can play without credentials (`npm run verify:fixture`). The Web SDK path uses the Glean session already in your browser.

See the full writeup at [developers.glean.com/cookbook/company-answers](https://developers.glean.com/cookbook/company-answers).
