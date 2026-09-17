import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { agentId, runId, snapshot } from './fixtures.js';
const exec = promisify(execFile);

test('raw authored curl sequence works without command repair', async () => {
  const readme = await readFile(
    new URL('../README.md', import.meta.url),
    'utf8',
  );
  const blocks = [...readme.matchAll(/```bash\n([\s\S]*?)```/g)].map(
    (match) => match[1]!,
  );
  const start = blocks.find((block) => block.includes('--data @start.json'))!;
  const get = blocks.find((block) => block.includes("jq '{request_id"))!;
  const prepare = blocks.find((block) =>
    block.startsWith("jq -e '.run.state"),
  )!;
  const respond = blocks.find((block) =>
    block.includes('--data @responses.json'),
  )!;
  const finish = blocks.find(
    (block) =>
      block.startsWith('curl') &&
      block.includes('/runs/$RUN_ID"') &&
      block.endsWith('jq . run.json\n'),
  )!;
  const cancel = blocks.find((block) => block.includes('/cancellations"'))!;
  for (const block of [start, get, prepare, respond, finish, cancel])
    assert.ok(block);
  const seen: { method: string; url: string; body: unknown }[] = [];
  let current = snapshot('RUNNING');
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    seen.push({
      method: req.method!,
      url: req.url!,
      body: raw ? JSON.parse(raw) : null,
    });
    let status = 200;
    if (req.url?.endsWith('/runs') && req.method === 'POST') {
      status = 201;
      current = snapshot('RUNNING');
    } else if (req.url?.endsWith('/responses')) current = snapshot('SUCCEEDED');
    else if (req.url?.endsWith('/cancellations'))
      current = snapshot('CANCELLED');
    else if (current.run.state === 'RUNNING') current = snapshot();
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(current));
  });
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'hitl-curl-'));
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const env = {
      ...process.env,
      GLEAN_SERVER_URL: `http://127.0.0.1:${address.port}`,
      GLEAN_AGENT_ID: agentId,
      GLEAN_API_TOKEN: 'fixture-only',
      RUN_ID: runId,
    };
    const source = JSON.parse(
      await readFile(
        new URL('../requests/start-run.json', import.meta.url),
        'utf8',
      ),
    );
    source.messages[0].content[0].text =
      'Post fixture marker to fixture channel.';
    await writeFile(path.join(cwd, 'start.json'), JSON.stringify(source));
    // Only documented inputs are filled. The authored shell commands are unmodified.
    await exec('bash', ['-e', '-c', `${start}\n${get}\n${prepare}`], {
      cwd,
      env,
    });
    const responses = JSON.parse(
      await readFile(path.join(cwd, 'responses.json'), 'utf8'),
    );
    assert.equal(responses.responses[0].decision, 'REJECT');
    responses.responses[0].decision = 'APPROVE'; // The reader's explicit review step.
    await writeFile(
      path.join(cwd, 'responses.json'),
      JSON.stringify(responses),
    );
    await exec('bash', ['-e', '-c', `${respond}\n${finish}\n${cancel}`], {
      cwd,
      env,
    });
    assert.equal(
      seen.filter(
        (call) => call.method === 'POST' && call.url.endsWith('/runs'),
      ).length,
      1,
    );
    assert.deepEqual(
      seen.find((call) => call.url.endsWith('/responses'))!.body,
      responses,
    );
    assert.ok(
      seen.every((call) => call.url.startsWith(`/api/agents/${agentId}/runs`)),
    );
    assert.equal(
      JSON.parse(await readFile(path.join(cwd, 'run.json'), 'utf8')).run.state,
      'CANCELLED',
    );
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    await rm(cwd, { recursive: true, force: true });
  }
});
