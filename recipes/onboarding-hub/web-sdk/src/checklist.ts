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
  if (!Array.isArray(raw)) return [];
  const steps: OnboardingStep[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      typeof row.title !== 'string' ||
      typeof row.askPrompt !== 'string' ||
      typeof row.group !== 'string' ||
      !GROUPS.has(row.group as MilestoneGroup)
    ) {
      continue;
    }
    steps.push({
      id: row.id,
      title: row.title,
      group: row.group as MilestoneGroup,
      initiallyDone: Boolean(row.initiallyDone),
      dueDate: typeof row.dueDate === 'string' ? row.dueDate : undefined,
      askPrompt: row.askPrompt,
    });
  }
  return steps;
}

/**
 * Live: GET /steps.json if the reader copied steps.example.json → steps.json.
 * Otherwise: empty checklist (do not invent a named hire).
 */
export async function loadSteps(): Promise<{
  steps: OnboardingStep[];
  source: 'config' | 'empty';
}> {
  try {
    const response = await fetch('/steps.json');
    if (response.ok) {
      return {
        steps: parseSteps(await response.json()),
        source: 'config',
      };
    }
  } catch {
    // missing steps.json is the empty-live path
  }

  return { steps: [], source: 'empty' };
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
