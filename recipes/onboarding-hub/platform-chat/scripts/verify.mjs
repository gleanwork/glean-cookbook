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

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_QUERIES = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts', 'demo-queries.json'), 'utf8'),
);

function assertFixtureMatchesOpenApi(fixture, { allowEmpty = false } = {}) {
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
  if (!Array.isArray(annotations)) {
    return 'fixture annotations must be an array';
  }
  if (!allowEmpty && annotations.length < 1) {
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

const OFF_CORPUS = "Ask about a step your docs don't cover";

const CHECKS = [
  {
    query: 'What should I do on my first day?',
    assert(result) {
      if (result.answer.trim().length === 0) return 'answer was empty';
      if (useFixture && result.citations.length === 0) {
        return 'fixture response missing citations';
      }
      if (result.escalate)
        return 'expected escalate=false for a cited day-one answer';
      return null;
    },
  },
  {
    query: 'How do I set up VPN?',
    assert(result) {
      if (useFixture) {
        if (result.answer.trim().length === 0)
          return 'fixture VPN answer was empty';
        if (result.citations.length === 0) {
          return 'fixture VPN response missing citations';
        }
        return null;
      }
      if (result.answer.trim().length === 0) return 'answer was empty';
      if (result.citations.length === 0) {
        return 'citations were empty — expected a VPN setup citation';
      }
      return null;
    },
  },
  {
    query: "What's our PTO policy?",
    assert(result) {
      if (useFixture) {
        if (result.answer.trim().length === 0)
          return 'fixture PTO answer was empty';
        if (result.citations.length === 0) {
          return 'fixture PTO response missing citations';
        }
        return null;
      }
      if (result.answer.trim().length === 0) return 'answer was empty';
      if (result.citations.length === 0) {
        return 'citations were empty — expected a PTO policy citation';
      }
      return null;
    },
  },
  {
    query: OFF_CORPUS,
    assert(result) {
      if (useFixture) {
        if (result.answer.trim().length > 0) {
          return 'off-corpus fixture should return an empty answer';
        }
        if (result.citations.length > 0) {
          return 'off-corpus fixture should have no citations';
        }
        if (!result.escalate) {
          return 'expected escalate=true when the answer is empty';
        }
        return null;
      }
      // Live corpora vary; require the escalation signal when the answer is thin.
      if (
        (result.answer.trim().length < 20 || result.citations.length === 0) &&
        !result.escalate
      ) {
        return 'expected escalate=true when live answer is empty/short or uncited';
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

  const checkQueries = CHECKS.map((c) => c.query);
  if (JSON.stringify(checkQueries) !== JSON.stringify(DEMO_QUERIES)) {
    console.error(
      '✗ scripts/demo-queries.json must match verify CHECKS order exactly',
    );
    console.error(`  demo-queries: ${JSON.stringify(DEMO_QUERIES)}`);
    console.error(`  CHECKS:       ${JSON.stringify(checkQueries)}`);
    process.exit(1);
  }

  if (useFixture) {
    const fixturePath = path.join(root, 'fixtures', 'chat-responses.json');
    const recorded = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    for (const query of DEMO_QUERIES) {
      const fixture = recorded[query];
      if (!fixture) {
        console.error(`✗ fixtures/chat-responses.json missing key: ${query}`);
        process.exit(1);
      }
      const shapeError = assertFixtureMatchesOpenApi(fixture, {
        allowEmpty: query === OFF_CORPUS,
      });
      if (shapeError) {
        console.error(`✗ fixture OpenAPI shape (${query}): ${shapeError}`);
        process.exit(1);
      }
    }
    console.log(
      `✓ ${DEMO_QUERIES.length} recorded fixtures match ChatCompletedResponse shape`,
    );
  }

  const server = startServer();

  try {
    await waitForServer(Date.now() + START_TIMEOUT_MS);

    if (useFixture) {
      const checklistResponse = await fetch(`${BASE_URL}/api/checklist`);
      if (!checklistResponse.ok) {
        throw new Error(`/api/checklist returned ${checklistResponse.status}`);
      }
      const checklist = await checklistResponse.json();
      if (checklist.source !== 'fixture') {
        throw new Error(
          `expected checklist.source "fixture", got ${JSON.stringify(checklist.source)}`,
        );
      }
      if (!Array.isArray(checklist.steps) || checklist.steps.length < 1) {
        throw new Error('fixture checklist.steps must be a non-empty array');
      }
      for (const step of checklist.steps) {
        if (
          typeof step?.id !== 'string' ||
          typeof step?.title !== 'string' ||
          typeof step?.askPrompt !== 'string' ||
          typeof step?.group !== 'string'
        ) {
          throw new Error(
            `fixture checklist step missing required fields: ${JSON.stringify(step)}`,
          );
        }
      }
      console.log(
        `✓ /api/checklist fixture — ${checklist.steps.length} step(s)`,
      );
    }

    for (const check of CHECKS) {
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
            `✓ "${check.query}" — ${result.citations?.length ?? 0} citation(s)` +
              (result.escalate ? ', escalate' : ''),
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
