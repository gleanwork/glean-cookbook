import { pathToFileURL } from 'node:url';
import meow from 'meow';
import { createDocumentsClient } from './client.js';
import {
  assertDocumentSpecs,
  formatBatch,
  type DocumentSpec,
} from './documents.js';
import { printCliError } from './errors.js';
import { batchRetrieveDocuments } from './workflow.js';

export interface BatchCliOptions {
  email?: string;
  serverUrl?: string;
  specs: DocumentSpec[];
  content: boolean;
}

const TAKES_VALUE = new Set(['--email', '--server-url']);

function specFromFlag(flag: '--url' | '--id', value: string): DocumentSpec {
  if (flag === '--url') {
    if (value.trim() === '') throw new Error('--url must not be blank.');
    return { url: value.trim() };
  }
  const documentId = value.trim();
  if (documentId === '') throw new Error('--id must not be blank.');
  return { document_id: documentId };
}

export function specsFromArgv(argv: readonly string[]): DocumentSpec[] {
  const specs: DocumentSpec[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined || token === '--') continue;

    const inlineUrl = token.startsWith('--url=');
    const inlineId = token.startsWith('--id=');
    if (inlineUrl || inlineId || token === '--url' || token === '--id') {
      const flag = inlineUrl || token === '--url' ? '--url' : '--id';
      const value = inlineUrl
        ? token.slice('--url='.length)
        : inlineId
          ? token.slice('--id='.length)
          : argv[index + 1];
      if (!inlineUrl && !inlineId) index += 1;
      if (value === undefined || value.startsWith('-')) {
        throw new Error(`${flag} requires a value.`);
      }
      specs.push(specFromFlag(flag, value));
      continue;
    }

    if (TAKES_VALUE.has(token)) index += 1;
  }
  return specs;
}

export function parseCliOptions(argv = process.argv.slice(2)): BatchCliOptions {
  const cli = meow(
    `
      Usage
        $ npm start -- (--url <url> | --id <document-id>)... [options]

      Options
        --email         Work email used to discover the Glean backend
        --server-url    Backend origin, for example https://<instance>-be.glean.com
        --url           Document URL; repeat it to send more than one
        --id            document_id; repeat it to send more than one
        --content       Also request extracted text (include CONTENT)

      Authentication
        OAuth uses documents:read. Login already requests that scope.
        For an API token, choose documents:read (legacy label DOCUMENTS).

      Send 1 to 100 --url and --id values, in the order you want them sent.
      Each value is a document ID or a URL, not both. Documents Glean returns
      are printed under results, with the document ID in parentheses. A document ID or URL Glean does not return
      is printed under warnings, and the command still exits 0.

      Examples
        $ npm start -- --email you@example.com --url "https://docs.example/wiki/plan"
        $ npm start -- --email you@example.com --url "https://docs.example/wiki/plan" --id "doc/1" --url "https://example.invalid/not-indexed" --content
    `,
    {
      importMeta: import.meta,
      argv,
      flags: {
        email: { type: 'string' },
        serverUrl: { type: 'string' },
        url: { type: 'string', isMultiple: true },
        id: { type: 'string', isMultiple: true },
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
  if (cli.flags.email !== undefined && !email) {
    throw new Error('--email must not be blank.');
  }
  if (cli.flags.serverUrl !== undefined && !serverUrl) {
    throw new Error('--server-url must not be blank.');
  }

  return {
    email,
    serverUrl,
    specs: specsFromArgv(argv),
    content: cli.flags.content,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliOptions(argv);
  if (options.specs.length === 0) {
    throw new Error('Pass at least one --url or --id.');
  }
  assertDocumentSpecs(options.specs);
  const client = await createDocumentsClient(
    { email: options.email, serverUrl: options.serverUrl },
    console.log,
  );
  const response = await batchRetrieveDocuments(client, {
    specs: options.specs,
    includeContent: options.content,
  });
  console.log(formatBatch(response, options.specs.length, options.content));
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
