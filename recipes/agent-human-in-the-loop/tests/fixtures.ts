import type { RunState, Snapshot } from '../public/model.js';
export const agentId = 'agent_fixture';
export const runId = 'run_fixture';
export function snapshot(
  state: RunState = 'REQUIRES_INPUT',
  ids = ['approval_1'],
): Snapshot {
  return {
    request_id: 'request_fixture',
    run: {
      agent_id: agentId,
      run_id: runId,
      state,
      created_at: '2026-09-17T16:00:00Z',
      updated_at: '2026-09-17T16:01:00Z',
      pending_interactions:
        state === 'REQUIRES_INPUT'
          ? ids.map((id) => ({
              interaction_id: id,
              type: 'TOOL_APPROVAL',
              display_name: 'Post to a Slack channel',
              description:
                'Publish the supplied message to the selected test channel.',
              arguments: {
                channel_id: 'C_TEST_CHANNEL',
                text: 'HITL cookbook test · fixture only',
              },
            }))
          : [],
      ...(state === 'SUCCEEDED'
        ? {
            output: {
              messages: [
                {
                  role: 'GLEAN_AI',
                  content: [
                    {
                      type: 'text',
                      text: 'The test tool reported success. This is a synthetic response, not a real post.',
                    },
                  ],
                },
              ],
            },
          }
        : {}),
      ...(state === 'FAILED'
        ? {
            error: {
              code: 'execution_failed',
              message: 'Synthetic failure for UI testing.',
            },
          }
        : {}),
    },
  };
}
