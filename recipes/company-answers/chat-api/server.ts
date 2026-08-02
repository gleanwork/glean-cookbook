import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Glean } from '@gleanwork/api-client';

// Path B (Chat API): you own the UI, the server owns the API token.
// Verified live against a real Glean instance — two corrections from a
// first-draft reading of the API:
//   1. The client constructor takes `instance` (or a full `serverURL`),
//      not `domain` — `domain` isn't a real SDKOptions field even though
//      it appears in one of the package's own bundled example files.
//   2. `message.citations[]` is deprecated and, on a live agentic chat
//      response, isn't populated at all — citations live per-fragment,
//      in `fragment.citation.sourceDocument`. The response can also
//      include non-answer messages (search/read step narration) ahead
//      of the real answer — filter to `messageType === 'CONTENT'` or
//      that narration text ends up prepended to the rendered answer.
const glean = new Glean({
  apiToken: requireEnv('GLEAN_API_TOKEN'),
  instance: requireEnv('GLEAN_INSTANCE'),
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function askGlean(question: string) {
  const response = await glean.client.chat.create({
    messages: [
      {
        author: 'USER',
        fragments: [{ text: question }],
      },
    ],
  });

  const contentMessages = (response.messages ?? []).filter(
    (message) => message.messageType === 'CONTENT',
  );
  const fragments = contentMessages.flatMap(
    (message) => message.fragments ?? [],
  );

  const answer = fragments.map((fragment) => fragment.text ?? '').join('');

  // A chat run that invoked a server tool can come back HTTP 200 with the run
  // unfinished: the CONTENT message is present but empty, the last message is a
  // SERVER_TOOL, and there is no error field anywhere. Verified live -- about one
  // in four runs of a tool-invoking question. Returning the empty string here
  // would render a blank answer panel and look like the app is broken, so treat
  // it as the failure it is and let the caller retry.
  if (answer.trim().length === 0) {
    throw new Error(
      'Glean returned no answer text. This happens when a chat run ends while ' +
        'a server tool is still pending; the request succeeded but the answer ' +
        'was never produced. Retrying usually works.',
    );
  }

  const citations = fragments
    .map((fragment) => fragment.citation?.sourceDocument)
    .filter(
      (document): document is NonNullable<typeof document> =>
        !!document?.title && !!document?.url,
    );
  const uniqueCitations = Array.from(
    new Map(citations.map((document) => [document.url, document])).values(),
  );

  return { answer, citations: uniqueCitations };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(publicDir, 'index.html')));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/ask') {
    try {
      const body = await readJsonBody(req);
      const { answer, citations } = await askGlean(body.question);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ answer, citations }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (error as Error).message }));
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

function readJsonBody(
  req: http.IncomingMessage,
): Promise<{ question: string }> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Company Answers (Chat API) running at http://localhost:${port}`);
});
