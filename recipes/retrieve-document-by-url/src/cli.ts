import { pathToFileURL } from 'node:url';
import meow from 'meow';
import { createDocumentsClient } from './client.js';
import { formatRetrieval } from './documents.js';
import { printCliError } from './errors.js';
import { retrieveDocumentByUrl } from './workflow.js';

export interface RetrieveCliOptions {
  email?: string;
  serverUrl?: string;
  url: string;
  content: boolean;
}

export function parseCliOptions(
  argv = process.argv.slice(2),
): RetrieveCliOptions {
  const cli = meow(
    `
      Usage
        $ npm start -- --url <document-url> [options]

      Options
        --email         Work email used to discover the Glean backend
        --server-url    Backend origin, for example https://<instance>-be.glean.com
        --url           Document URL to retrieve
        --content       Also request extracted text (include=CONTENT)

      Authentication
        OAuth uses documents:read. Login already requests that scope.
        For an API token, choose documents:read (legacy label DOCUMENTS).

      Examples
        $ npm start -- --email you@example.com --url "https://docs.example/wiki/plan"
        $ npm start -- --email you@example.com --url "https://docs.example/wiki/plan" --content
    `,
    {
      importMeta: import.meta,
      argv,
      flags: {
        email: { type: 'string' },
        serverUrl: { type: 'string' },
        url: { type: 'string' },
        content: { type: 'boolean', default: false },
      },
    },
  );

  const unexpected = cli.input[0];
  if (unexpected !== undefined) {
    throw new Error(`Unexpected argument: ${unexpected}`);
  }

  const email = cli.flags.email?.trim();
  const serverUrl = cli.flags.serverUrl?.trim();
  const url = cli.flags.url?.trim();
  if (cli.flags.email !== undefined && !email) {
    throw new Error('--email must not be blank.');
  }
  if (cli.flags.serverUrl !== undefined && !serverUrl) {
    throw new Error('--server-url must not be blank.');
  }
  if (!url) throw new Error('--url is required and must not be blank.');

  return { email, serverUrl, url, content: cli.flags.content };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliOptions(argv);
  const client = await createDocumentsClient(
    { email: options.email, serverUrl: options.serverUrl },
    console.log,
  );
  const result = await retrieveDocumentByUrl(client, {
    url: options.url,
    includeContent: options.content,
  });
  console.log(
    formatRetrieval({
      submittedUrl: options.url,
      ...result,
      includeContent: options.content,
    }),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch((error: unknown) => {
    printCliError(error);
    process.exitCode = 1;
  });
}
