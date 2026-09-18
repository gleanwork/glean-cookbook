import { listenLocal } from './lib/cookbook-server.js';
import { createAgentRuns } from './src/agent-runs.js';
import { createExplorerServer } from './src/explorer.js';

try {
  const agentId = process.env.GLEAN_AGENT_ID ?? '';
  const client = createAgentRuns({
    serverUrl: process.env.GLEAN_SERVER_URL ?? '',
    agentId,
  });
  listenLocal(createExplorerServer(client, agentId), 'Agent HITL explorer');
} catch {
  console.error(
    'Set GLEAN_SERVER_URL to your complete backend HTTPS origin and GLEAN_AGENT_ID in .env. See README.md.',
  );
  process.exitCode = 1;
}
