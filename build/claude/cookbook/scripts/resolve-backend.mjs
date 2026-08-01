#!/usr/bin/env node
// Resolves a Glean backend URL from a work email, and checks whether OAuth
// is available for that tenant -- the auth-discovery chain every recipe
// needs before it can call the Client/Platform/Indexing API. Ships as one
// tested script instead of a raw HTTP call description an agent re-derives
// from memory each time (the exact failure mode the citations bug came from).

const email = process.argv[2];
if (!email) {
  console.error('Usage: node resolve-backend.mjs <work-email>');
  process.exit(1);
}

const configResponse = await fetch('https://app.glean.com/config/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email }),
});
if (!configResponse.ok) {
  console.error(
    `config/search returned ${configResponse.status}: ${await configResponse.text()}`,
  );
  process.exit(1);
}

const config = await configResponse.json();
const queryURL = config?.search_config?.queryURL;
if (!queryURL) {
  console.error(
    `No search_config.queryURL in response -- unexpected shape: ${JSON.stringify(config)}`,
  );
  process.exit(1);
}

const instanceMatch = new URL(queryURL).hostname.match(/^([^.]+)\./);
if (!instanceMatch) {
  console.error(`Could not extract instance from queryURL: ${queryURL}`);
  process.exit(1);
}
const instance = instanceMatch[1];

// An unrecognized email doesn't error -- config/search silently falls back
// to Glean's own generic "app" tenant (confirmed live: queryURL resolves to
// app.askscio.com, not a real customer subdomain). Treat that fallback as
// "not found" rather than returning a backend that isn't actually theirs.
if (instance === 'app') {
  console.error(
    `"${email}" didn't resolve to a real tenant (got the generic fallback, not a customer subdomain). Double-check the email.`,
  );
  process.exit(1);
}

const backend = `https://${instance}-be.glean.com`;

let oauthAvailable = false;
try {
  const oauthResponse = await fetch(
    `${backend}/.well-known/oauth-authorization-server`,
  );
  oauthAvailable = oauthResponse.ok;
} catch {
  oauthAvailable = false;
}

console.log(JSON.stringify({ instance, backend, oauthAvailable }, null, 2));
