import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import meow from 'meow';
import { discoverBackend } from '../scripts/tenant-discovery.mjs';
import { loginWithOAuth } from './oauth.js';
import { parseGleanServerURL } from './server-url.js';

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

function validServerURL(value: string): string {
  return parseGleanServerURL(value).origin;
}

type DiscoverBackend = (
  email: string,
) => Promise<{ instance: string; backend: string }>;

export async function resolveServerURL(
  options: { serverURL?: string; email?: string; savedServerURL?: string },
  discover: DiscoverBackend = discoverBackend,
): Promise<string> {
  const explicitServerURL = options.serverURL?.trim();
  if (explicitServerURL) return validServerURL(explicitServerURL);

  const email = options.email?.trim();
  if (email) {
    const { backend } = await discover(email);
    return validServerURL(backend);
  }

  const savedServerURL = options.savedServerURL?.trim();
  if (savedServerURL) return validServerURL(savedServerURL);

  throw new Error(
    'Pass --email to discover your Glean tenant, or use --server-url as an override.',
  );
}

export async function main() {
  const cli = meow(
    `
      Usage
        $ npm run login -- --email <work-email>

      Options
        --email       Work email used to discover your Glean tenant
        --server-url  Optional backend override, such as https://acme-be.glean.com

      OAuth
        Uses Dynamic Client Registration and Authorization Code with PKCE.
        Set GLEAN_OAUTH_CLIENT_ID to use an administrator-provisioned public
        client instead of DCR.
    `,
    {
      importMeta: import.meta,
      flags: {
        email: { type: 'string' },
        serverUrl: { type: 'string' },
      },
    },
  );
  const serverURL = await resolveServerURL({
    serverURL: cli.flags.serverUrl,
    email: cli.flags.email,
    savedServerURL: process.env.GLEAN_SERVER_URL,
  });
  const issuer = new URL(serverURL);

  await loginWithOAuth(issuer);
  await saveServerURL(serverURL);
  console.log(
    `Signed in to ${issuer.hostname} with OAuth. Client registration and refresh tokens are stored outside the project.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
