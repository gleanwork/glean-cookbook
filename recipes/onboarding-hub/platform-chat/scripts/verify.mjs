#!/usr/bin/env node
// Verify gate for onboarding-hub/platform-chat. Runs in fixture mode by default
// (GLEAN_USE_FIXTURE=true) so CI can validate the OpenAPI response parser without
// a live /api/chat handler. Set GLEAN_USE_FIXTURE=false with real credentials for
// live verification against your instance.
//
// Fixture shape is checked against ChatCompletedResponse in
// scio/openapi/public/platform/chat.yaml (required fields + nested citation path).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;
const START_TIMEOUT_MS = 15_000;
const useFixture = process.env.GLEAN_USE_FIXTURE !== 'false';
const RESPONSE_ID_RE =
  /^resp_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function assertFixtureMatchesOpenApi(fixture) {
  const required = [
    'id',
    'object',
    'created_at',
    'status',
    'output',
    'store',
    'request_id',
  ];
  for (const key of required) {
    if (!(key in fixture)) return `fixture missing required field: ${key}`;
  }
  if (fixture.object !== 'response') {
    return `fixture.object must be "response", got ${JSON.stringify(fixture.object)}`;
  }
  if (fixture.status !== 'completed') {
    return `fixture.status must be "completed", got ${JSON.stringify(fixture.status)}`;
  }
  if (typeof fixture.store !== 'boolean') {
    return 'fixture.store must be a boolean';
  }
  if (typeof fixture.request_id !== 'string' || fixture.request_id.length < 1) {
    return 'fixture.request_id must be a non-empty string';
  }
  if (
    typeof fixture.created_at !== 'string' ||
    Number.isNaN(Date.parse(fixture.created_at))
  ) {
    return 'fixture.created_at must be an RFC 3339 timestamp';
  }
  if (!RESPONSE_ID_RE.test(fixture.id)) {
    return `fixture.id must match resp_<uuid4>, got ${JSON.stringify(fixture.id)}`;
  }
  if (!Array.isArray(fixture.output) || fixture.output.length !== 1) {
    return 'fixture.output must be an array of length 1';
  }
  const message = fixture.output[0];
  if (message?.type !== 'message' || message?.role !== 'assistant') {
    return 'fixture.output[0] must be { type: "message", role: "assistant" }';
  }
  if (!Array.isArray(message.content) || message.content.length !== 1) {
    return 'fixture.output[0].content must be an array of length 1';
  }
  const block = message.content[0];
  if (block?.type !== 'output_text' || typeof block.text !== 'string') {
    return 'fixture content must be { type: "output_text", text: string }';
  }
  const annotations = block.annotations ?? [];
  if (!Array.isArray(annotations) || annotations.length < 1) {
    return 'fixture must include at least one citation annotation';
  }
  for (const annotation of annotations) {
    if (annotation?.type !== 'citation') {
      return 'fixture annotation.type must be "citation"';
    }
    if (!Array.isArray(annotation.sources) || annotation.sources.length < 1) {
      return 'fixture citation.sources must be a non-empty array';
    }
    for (const source of annotation.sources) {
      if (source?.type !== 'document') {
        return 'fixture demo citation source.type must be "document"';
      }
      if (!source.document_id && !source.url) {
        return 'document source requires document_id or url';
      }
    }
  }
  return null;
}

const CHECKS = [
  {
    query: 'What should Alex do on day one?',
    assert(result) {
      if (result.answer.trim().length === 0) return 'answer was empty';
      if (useFixture && result.citations.length === 0) {
        return 'fixture response missing citations';
      }
      return null;
    },
  },
  {
    query: "What's our PTO policy?",
    assert(result) {
      if (!useFixture) {
        if (result.answer.trim().length === 0) return 'answer was empty';
        if (result.citations.length === 0) {
          return 'citations were empty — expected hr-pto-policy';
        }
      }
      return null;
    },
  },
];

function assertCitationShape(citations) {
  for (const citation of citations) {
    if (!citation.title || !citation.url) {
      return `citation missing title/url: ${JSON.stringify(citation)}`;
    }
  }
  const urls = citations.map((c) => c.url);
  if (new Set(urls).size !== urls.length) {
    return 'citations contain duplicate urls';
  }
  return null;
}

function startServer() {
  const child = spawn('npm', ['start'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env,
      GLEAN_USE_FIXTURE: useFixture ? 'true' : 'false',
    },
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  return child;
}

async function waitForServer(deadline) {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL, { method: 'GET' });
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Server did not become ready within ${START_TIMEOUT_MS}ms`);
}

async function askGlean(question) {
  const response = await fetch(`${BASE_URL}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`/api/ask returned ${response.status}: ${body}`);
  }
  return response.json();
}

async function main() {
  console.log(
    useFixture
      ? 'Running verify in fixture mode (GLEAN_USE_FIXTURE=true)'
      : 'Running verify against live POST /api/chat',
  );

  let failed = false;

  if (useFixture) {
    const fixturePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'fixtures',
      'chat-response.json',
    );
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const shapeError = assertFixtureMatchesOpenApi(fixture);
    if (shapeError) {
      console.error(`✗ fixture OpenAPI shape: ${shapeError}`);
      process.exit(1);
    }
    console.log('✓ fixture matches ChatCompletedResponse required shape');
  }

  const server = startServer();

  try {
    await waitForServer(Date.now() + START_TIMEOUT_MS);

    for (const check of CHECKS) {
      if (!useFixture && check.query.includes('PTO')) {
        // live-only check
      }
      try {
        const result = await askGlean(check.query);
        const behaviorError = check.assert(result);
        const shapeError =
          behaviorError ??
          (result.citations?.length
            ? assertCitationShape(result.citations)
            : null);
        if (shapeError) {
          failed = true;
          console.error(`✗ "${check.query}": ${shapeError}`);
        } else {
          console.log(
            `✓ "${check.query}" — ${result.citations?.length ?? 0} citation(s)`,
          );
        }
      } catch (error) {
        failed = true;
        console.error(`✗ "${check.query}": ${error.message}`);
      }
    }
  } catch (error) {
    failed = true;
    console.error(`✗ server never became ready: ${error.message}`);
  } finally {
    server.kill();
  }

  if (failed) {
    console.error('\nverify failed — see above.');
    process.exit(1);
  }
  console.log('\nAll demo queries passed.');
}

main();
