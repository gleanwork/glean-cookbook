export type MilestoneGroup = 'it' | 'hr' | 'team' | 'engineering';

export interface OnboardingStep {
  id: string;
  title: string;
  group: MilestoneGroup;
  initiallyDone: boolean;
  dueDate?: string;
  askPrompt: string;
}

/** Seeded from acme-corpus/documents/hr/hr-onboarding-checklist-alex-kim.json */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'laptop',
    title: 'Laptop provisioned',
    group: 'it',
    initiallyDone: true,
    askPrompt: 'What should I know about my Acme laptop setup?',
  },
  {
    id: 'badge',
    title: 'Badge access',
    group: 'it',
    initiallyDone: true,
    askPrompt: 'Where do I pick up or activate my badge?',
  },
  {
    id: 'it-account',
    title: 'IT account setup',
    group: 'it',
    initiallyDone: true,
    askPrompt: 'How do I finish IT account setup on day one?',
  },
  {
    id: 'slack-email',
    title: 'Slack and email access',
    group: 'it',
    initiallyDone: true,
    askPrompt: 'How do I get into Slack and email on my first day?',
  },
  {
    id: 'team-intro',
    title: 'Team introduction meeting',
    group: 'team',
    initiallyDone: true,
    askPrompt: 'Who should I meet on the payments platform team?',
  },
  {
    id: 'security-training',
    title: 'Security awareness training',
    group: 'hr',
    initiallyDone: false,
    dueDate: '2026-07-20',
    askPrompt:
      'What is required for security awareness training and when is it due?',
  },
  {
    id: 'benefits',
    title: 'Benefits enrollment',
    group: 'hr',
    initiallyDone: false,
    dueDate: '2026-08-05',
    askPrompt: 'How do I enroll in Acme benefits and what is the deadline?',
  },
  {
    id: 'manager-1on1',
    title: '1:1 with Priya Natarajan',
    group: 'team',
    initiallyDone: false,
    dueDate: '2026-07-24',
    askPrompt: 'When is my 1:1 with Priya Natarajan scheduled?',
  },
  {
    id: 'architecture-walkthrough',
    title: 'Payments-service architecture walkthrough',
    group: 'engineering',
    initiallyDone: false,
    askPrompt:
      'What should I know about the payments-service architecture before the walkthrough?',
  },
];

export const MILESTONE_LABELS: Record<MilestoneGroup, string> = {
  it: 'IT setup',
  hr: 'HR',
  team: 'Team',
  engineering: 'Engineering',
};

export const STORAGE_KEY = 'acme.onboarding-hub.v1';

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
