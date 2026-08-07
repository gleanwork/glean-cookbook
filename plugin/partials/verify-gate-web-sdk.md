If the selected path uses Web SDK cookie SSO, do not open the app in an agent-controlled browser,
incognito window, Playwright, or any other browser automation. Those browsers do not carry the
user's existing Glean session. Start the development server, keep it running, report the exact local
URL printed by the server, and ask the user to open that URL in their normal browser where they are
signed in to Glean. Wait for the user to report the result before claiming the live check passed.
