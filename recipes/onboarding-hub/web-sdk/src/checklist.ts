export type MilestoneGroup = 'it' | 'hr' | 'team' | 'engineering';

export interface OnboardingStep {
  id: string;
  title: string;
  group: MilestoneGroup;
  initiallyDone: boolean;
  dueDate?: string;
  askPrompt: string;
}

export const MILESTONE_LABELS: Record<MilestoneGroup, string> = {
  it: 'IT setup',
  hr: 'HR',
  team: 'Team',
  engineering: 'Engineering',
};

export const STORAGE_KEY = 'onboarding-hub.v1';

const GROUPS = new Set<MilestoneGroup>(['it', 'hr', 'team', 'engineering']);

export interface OnboardingResource {
  title: string;
  url: string;
}

export type StepsSource = 'config' | 'missing' | 'error';

export interface LoadedSteps {
  steps: OnboardingStep[];
  source: StepsSource;
  error?: string;
}

function isSafeLinkUrl(value: string): boolean {
  if (value.startsWith('//')) return false;
  if (value.startsWith('/')) return true;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

export function parseResources(raw: unknown): OnboardingResource[] {
  if (!Array.isArray(raw)) return [];
  const resources: OnboardingResource[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.title !== 'string' || typeof row.url !== 'string') continue;
    if (row.title.trim() === '' || !isSafeLinkUrl(row.url)) continue;
    resources.push({ title: row.title, url: row.url });
  }
  return resources;
}

export async function loadResources(): Promise<OnboardingResource[]> {
  try {
    const response = await fetch('/resources.json');
    if (response.ok) return parseResources(await response.json());
  } catch {
    // missing resources.json is the unconfigured path
  }
  return [];
}

export function parseSteps(raw: unknown): OnboardingStep[] {
  if (!Array.isArray(raw)) {
    throw new Error('public/steps.json must contain a JSON array.');
  }
  if (raw.length === 0) {
    throw new Error('public/steps.json must contain at least one step.');
  }

  const steps: OnboardingStep[] = [];
  const ids = new Set<string>();
  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== 'object') {
      throw new Error(`Step ${index + 1} must be a JSON object.`);
    }
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      row.id.trim() === '' ||
      typeof row.title !== 'string' ||
      row.title.trim() === '' ||
      typeof row.askPrompt !== 'string' ||
      row.askPrompt.trim() === '' ||
      typeof row.group !== 'string' ||
      !GROUPS.has(row.group as MilestoneGroup) ||
      typeof row.initiallyDone !== 'boolean' ||
      (row.dueDate !== undefined && typeof row.dueDate !== 'string')
    ) {
      throw new Error(
        `Step ${index + 1} must have non-empty id, title, and askPrompt strings; ` +
          'a valid group; a boolean initiallyDone; and an optional string dueDate.',
      );
    }

    const id = row.id.trim();
    if (ids.has(id)) {
      throw new Error(`Duplicate step id "${id}" in public/steps.json.`);
    }
    ids.add(id);

    steps.push({
      id,
      title: row.title.trim(),
      group: row.group as MilestoneGroup,
      initiallyDone: row.initiallyDone,
      dueDate:
        typeof row.dueDate === 'string' && row.dueDate.trim() !== ''
          ? row.dueDate.trim()
          : undefined,
      askPrompt: row.askPrompt.trim(),
    });
  }
  return steps;
}

/**
 * Load the reader's checklist. Missing and invalid configuration remain distinct
 * so the UI can explain the exact next step.
 */
export async function loadSteps(): Promise<LoadedSteps> {
  try {
    const response = await fetch('/steps.json');
    const contentType = response.headers.get('content-type') ?? '';
    if (response.status === 404 || contentType.includes('text/html')) {
      return { steps: [], source: 'missing' };
    }
    if (!response.ok) {
      return {
        steps: [],
        source: 'error',
        error: `Could not load public/steps.json (HTTP ${response.status}).`,
      };
    }

    const parsed = (await response.json()) as unknown;
    return { steps: parseSteps(parsed), source: 'config' };
  } catch (error) {
    const message =
      error instanceof SyntaxError
        ? 'public/steps.json contains invalid JSON.'
        : error instanceof Error
          ? error.message
          : 'Could not load public/steps.json.';
    return { steps: [], source: 'error', error: message };
  }
}

export function loadCompletedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { completed?: string[] };
    return new Set(parsed.completed ?? []);
  } catch {
    return new Set();
  }
}

export function saveCompletedIds(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ completed: [...ids] }));
  } catch {
    // localStorage blocked — degrade quietly
  }
}

export function isStepDone(
  step: OnboardingStep,
  completed: Set<string>,
): boolean {
  return step.initiallyDone || completed.has(step.id);
}

export function progressPercent(
  steps: OnboardingStep[],
  completed: Set<string>,
): number {
  if (steps.length === 0) return 0;
  const done = steps.filter((step) => isStepDone(step, completed)).length;
  return Math.round((done / steps.length) * 100);
}

export function milestoneStats(
  steps: OnboardingStep[],
  completed: Set<string>,
): Record<MilestoneGroup, { done: number; total: number }> {
  const stats = {
    it: { done: 0, total: 0 },
    hr: { done: 0, total: 0 },
    team: { done: 0, total: 0 },
    engineering: { done: 0, total: 0 },
  };
  for (const step of steps) {
    stats[step.group].total += 1;
    if (isStepDone(step, completed)) stats[step.group].done += 1;
  }
  return stats;
}

export const GENERIC_PROMPT = 'What should I do on my first day?';

export function buildContextPrompt(
  steps: OnboardingStep[],
  completed: Set<string>,
): string {
  if (steps.length === 0) return GENERIC_PROMPT;

  const pending = steps.filter((step) => !isStepDone(step, completed));
  if (pending.length === 0) {
    return 'I have finished every step on my onboarding checklist. What should I focus on next?';
  }

  return [
    'I am a new hire working through my onboarding checklist. These are the steps I still have to complete:',
    '',
    pending.map((step, index) => `${index + 1}. ${step.title}`).join('\n'),
    '',
    'Which of these should I prioritize on my first day, and are any of them blockers for the others?',
  ].join('\n');
}
