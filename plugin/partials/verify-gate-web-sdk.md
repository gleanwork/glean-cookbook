If the selected path uses Web SDK cookie SSO, do not open or automate the app in an
agent-controlled browser, incognito window, or Playwright. Use the recipe's declared app URL:
for a local scaffold, start its documented server and keep it running; for an existing hosted
app, use its actual URL without inventing another server. Give the user a clickable URL to
open in their normal signed-in browser. Record the observed result, reported by the user,
before claiming that live check passed. Missing browser/session access remains a blocker.
