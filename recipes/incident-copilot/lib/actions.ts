// Governed actions: a closed registry, an audit entry per attempt, and loud
// failures.
//
// Three properties the ticket calls non-negotiable, implemented as code paths
// rather than as prompt instructions:
//
//   1. Only pre-registered actions can execute. The model proposes an action *by
//      id*; it cannot describe a new one into existence. An unknown id is refused
//      and audited, which is the interesting case to watch.
//   2. Every attempt is audited, including refusals and failures. The log records
//      who approved, not just what ran.
//   3. Failures post back to the channel. A governed action that fails silently is
//      worse than one that never ran, because the incident channel now believes
//      the ticket was filed.
//
// What this does NOT claim: actions do not execute *as the approving user*. The
// ticket specifies that, but impersonation was removed from these recipes, so the
// executor is the app's own credential and the gate is an app-level policy check.
// That distinction is in the README and on the dashboard, because overstating it
// would be the one genuinely dangerous thing this recipe could teach.

export interface ActionInput {
  incidentId: string;
  service: string;
  summary: string;
  detail: string;
  /**
   * Demo seam: forces this action to fail so the failure path is observable.
   * Never read from user input in a real deployment.
   */
  simulateFailure?: string;
}

export interface ActionResult {
  ok: boolean;
  output: string;
}

export interface RegisteredAction {
  id: string;
  label: string;
  /** Shown on the approval card so the approver knows what they are authorizing. */
  effect: string;
  /**
   * True when the action changes something outside this app — code, config, or a
   * customer-visible surface. Mutating actions carry an extra evidence
   * precondition; see approval.ts.
   */
  mutates: boolean;
  run: (input: ActionInput) => Promise<ActionResult>;
}

/**
 * Stand-ins for real integrations. Each one is where a custom tool call would go;
 * they are deliberately inert so the recipe is safe to run against a live
 * instance, and `simulateFailure` exists so the failure path is demonstrable
 * rather than described.
 */
function simulated(
  id: string,
  label: string,
  effect: string,
  mutates: boolean,
  render: (input: ActionInput) => string,
): RegisteredAction {
  return {
    id,
    label,
    effect,
    mutates,
    run: async (input) => {
      if (
        (input.simulateFailure ?? process.env.SIMULATE_ACTION_FAILURE) === id
      ) {
        return {
          ok: false,
          output: `${label} failed: upstream returned 503 (simulated via SIMULATE_ACTION_FAILURE).`,
        };
      }
      return { ok: true, output: render(input) };
    },
  };
}

export const ACTIONS: RegisteredAction[] = [
  simulated(
    'file-tracking-ticket',
    'File tracking ticket',
    "Creates one issue in the service's project. No code or config is changed.",
    false,
    (input) =>
      `Created ${input.incidentId}-FOLLOWUP in the ${input.service} project: "${input.summary}"`,
  ),
  simulated(
    'post-status-update',
    'Post status update',
    'Posts one message to the on-call channel. Visible to the whole team.',
    false,
    (input) => `Posted to #eng-oncall: ${input.summary}`,
  ),
  simulated(
    'draft-fix-pr',
    'Draft fix PR',
    'Opens a DRAFT pull request. Never merges, never deploys.',
    true,
    (input) =>
      `Opened draft PR on ${input.service}: "${input.summary}" (draft; requires review)`,
  ),
];

export function findAction(id: string): RegisteredAction | undefined {
  return ACTIONS.find((action) => action.id === id);
}

export function actionCatalog(): Array<Omit<RegisteredAction, 'run'>> {
  return ACTIONS.map(({ id, label, effect, mutates }) => ({
    id,
    label,
    effect,
    mutates,
  }));
}

/** The action that is always safe: it asks a person to look, and changes nothing. */
export const FALLBACK_ACTION_ID = 'file-tracking-ticket';
