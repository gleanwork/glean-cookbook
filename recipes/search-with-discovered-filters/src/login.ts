import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import meow from 'meow';
import { loginWithOAuth } from './oauth.js';

async function saveServerURL(serverURL: string) {
  let contents = '';
  try {
    contents = await readFile('.env', 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const entry = `GLEAN_SERVER_URL=${serverURL}`;
  const next = /^GLEAN_SERVER_URL=.*$/mu.test(contents)
    ? contents.replace(/^GLEAN_SERVER_URL=.*$/mu, entry)
    : `${contents.trimEnd()}${contents.trim() ? '\n' : ''}${entry}\n`;
  await writeFile('.env', next, { mode: 0o600 });
}

async function main() {
  const cli = meow(
    `
      Usage
        $ npm run login -- --server-url <url>

      Options
        --server-url  Glean backend URL, such as https://acme-be.glean.com

      OAuth
        Uses Dynamic Client Registration and Authorization Code with PKCE.
        Set GLEAN_OAUTH_CLIENT_ID to use an administrator-provisioned public
        client instead of DCR.
    `,
    {
      importMeta: import.meta,
      flags: {
        serverUrl: { type: 'string' },
      },
    },
  );
  const serverURL = (
    cli.flags.serverUrl ??
    process.env.GLEAN_SERVER_URL ??
    ''
  ).trim();
  if (!serverURL) {
    throw new Error('Pass --server-url or set GLEAN_SERVER_URL in .env.');
  }

  const issuer = new URL(serverURL);
  if (
    issuer.protocol !== 'https:' ||
    issuer.pathname !== '/' ||
    issuer.search ||
    issuer.hash ||
    issuer.port ||
    !/^[a-z0-9-]+-be\.glean\.com$/u.test(issuer.hostname)
  ) {
    throw new Error(
      'Use a Glean backend URL such as https://acme-be.glean.com.',
    );
  }

  await loginWithOAuth(issuer);
  await saveServerURL(issuer.origin);
  console.log(
    'Signed in with OAuth. Client registration and refresh tokens are stored outside the project.',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
