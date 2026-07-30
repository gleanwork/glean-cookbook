#!/usr/bin/env node
// Optional live verification: confirm agent exists/schemas, then createRun.
// Requires GLEAN_INSTANCE, GLEAN_API_TOKEN, GLEAN_AGENT_ID.
// Does not start the HTTP server — exercises the SDK contract directly.

import 'dotenv/config';
import { Glean } from '@gleanwork/api-client';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  process.env.X_GLEAN_INCLUDE_EXPERIMENTAL ??= 'true';
  const agentId = requireEnv('GLEAN_AGENT_ID');
  const glean = new Glean({
    apiToken: requireEnv('GLEAN_API_TOKEN'),
    instance: requireEnv('GLEAN_INSTANCE'),
  });

  console.log(`Checking agent ${agentId}…`);
  try {
    const agent = await glean.agents.get(agentId);
    console.log(`✓ agents.get — name=${agent.name ?? '(unknown)'}`);
  } catch (error) {
    console.error(`✗ agents.get failed: ${error.message}`);
    console.error(
      'Hint: agent missing, unauthorized, or experimental Agents API not enabled.',
    );
    process.exit(1);
  }

  try {
    const schemas = await glean.agents.getSchemas(agentId);
    console.log(
      `✓ agents.getSchemas — input keys=${Object.keys(schemas.input_schema ?? schemas.inputSchema ?? {}).length}`,
    );
  } catch (error) {
    console.error(`✗ agents.getSchemas failed: ${error.message}`);
    process.exit(1);
  }

  const result = await glean.agents.createRun(
    {
      messages: [
        {
          role: 'USER',
          content: [
            {
              text: "What's the status of the Globex renewal?",
              type: 'text',
            },
          ],
        },
      ],
      stream: false,
    },
    agentId,
  );

  if (typeof result === 'string') {
    console.error('✗ createRun returned SSE string; expected wait response');
    process.exit(1);
  }

  const text = (result.messages ?? [])
    .filter((m) => m.role === 'GLEAN_AI')
    .flatMap((m) => m.content ?? [])
    .map((c) => c.text ?? '')
    .join('\n')
    .trim();

  if (!text) {
    console.error('✗ createRun returned empty GLEAN_AI text');
    process.exit(1);
  }

  const markdownLinks = [
    ...text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g),
  ];
  const bareUrls = [...text.matchAll(/https?:\/\/[^\s)\]>"']+/g)];
  if (markdownLinks.length === 0 && bareUrls.length === 0) {
    console.error(
      '✗ createRun answer has no citations/URLs — Account Brief must cite sources',
    );
    process.exit(1);
  }

  console.log(`✓ agents.createRun — ${text.slice(0, 120)}…`);
  console.log(
    `citations: ${markdownLinks.length} markdown link(s), ${bareUrls.length} url(s)`,
  );
  console.log(`request_id=${result.request_id}`);
  console.log('\nLive agent checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
