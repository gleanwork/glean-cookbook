import { renderChat } from '@gleanwork/web-sdk';
import {
  loadCompletedIds,
  loadSteps,
  MILESTONE_LABELS,
  progressPercent,
  milestoneStats,
  saveCompletedIds,
  isStepDone,
  type OnboardingStep,
} from './checklist';

const DEFAULT_CHAT = 'What should I do on my first day?';

const completed = loadCompletedIds();
let steps: OnboardingStep[] = [];
let source: 'fixture' | 'config' | 'empty' = 'empty';

function mountChat(initialMessage?: string): void {
  const container = document.getElementById('chat');
  if (!container) throw new Error('Missing #chat container');
  container.innerHTML = '';
  renderChat(container, {
    // backend: 'https://{your}-be.glean.com',
    ...(initialMessage ? { initialMessage } : {}),
  });
}

function renderProgress(): void {
  const percent = progressPercent(steps, completed);
  const ring = document.getElementById('progress-ring');
  const label = document.getElementById('progress-label');
  if (ring) ring.style.setProperty('--progress', String(percent));
  if (label) label.textContent = `${percent}%`;

  const badges = document.getElementById('milestone-badges');
  if (!badges) return;
  const stats = milestoneStats(steps, completed);
  badges.innerHTML = (Object.keys(stats) as Array<keyof typeof stats>)
    .map((group) => {
      const { done, total } = stats[group];
      const earned = done === total && total > 0;
      return `<span class="badge${earned ? ' earned' : ''}">${MILESTONE_LABELS[group]} ${done}/${total}</span>`;
    })
    .join('');
}

function stepRow(step: OnboardingStep): string {
  const done = isStepDone(step, completed);
  const due = step.dueDate
    ? `<span class="due">Due ${step.dueDate}</span>`
    : '';
  const askButton = done
    ? ''
    : `<button type="button" class="ask-btn" data-ask="${encodeURIComponent(step.askPrompt)}">Ask about this</button>`;
  const markButton = done
    ? ''
    : `<button type="button" class="mark-btn" data-mark="${step.id}">Mark complete</button>`;
  return `
    <li class="step${done ? ' done' : ''}" data-step="${step.id}">
      <span class="check" aria-hidden="true">${done ? '✓' : '○'}</span>
      <div class="step-body">
        <div class="step-title">${step.title} ${due}</div>
        <div class="step-actions">${askButton}${markButton}</div>
      </div>
    </li>`;
}

function renderChecklist(): void {
  const checklist = document.getElementById('checklist-panel');
  const donePanel = document.getElementById('done-panel');
  const emptyNote = document.getElementById('empty-checklist');
  if (!checklist || !donePanel) return;

  if (emptyNote) {
    emptyNote.hidden = source !== 'empty';
  }

  if (steps.length === 0) {
    checklist.hidden = false;
    donePanel.hidden = true;
    const pendingList = document.getElementById('pending-list');
    const doneList = document.getElementById('done-list');
    if (pendingList) pendingList.innerHTML = '';
    if (doneList) doneList.innerHTML = '';
    const pendingHeading = document.getElementById('pending-heading');
    const doneHeading = document.getElementById('done-heading');
    if (pendingHeading) pendingHeading.textContent = 'Still to do · 0';
    if (doneHeading) doneHeading.textContent = 'Completed · 0';
    return;
  }

  const pending = steps.filter((step) => !isStepDone(step, completed));
  const doneSteps = steps.filter((step) => isStepDone(step, completed));
  const allDone = pending.length === 0;

  if (allDone) {
    checklist.hidden = true;
    donePanel.hidden = false;
    return;
  }

  checklist.hidden = false;
  donePanel.hidden = true;

  const pendingList = document.getElementById('pending-list');
  const doneList = document.getElementById('done-list');
  const pendingHeading = document.getElementById('pending-heading');
  const doneHeading = document.getElementById('done-heading');

  if (pendingList) pendingList.innerHTML = pending.map(stepRow).join('');
  if (doneList) doneList.innerHTML = doneSteps.map(stepRow).join('');
  if (pendingHeading)
    pendingHeading.textContent = `Still to do · ${pending.length}`;
  if (doneHeading) doneHeading.textContent = `Completed · ${doneSteps.length}`;
}

function rerender(): void {
  renderProgress();
  renderChecklist();
}

function wireEvents(): void {
  document.body.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const ask = target.closest<HTMLButtonElement>('[data-ask]');
    if (ask?.dataset.ask) {
      const prompt = decodeURIComponent(ask.dataset.ask);
      mountChat(prompt);
      document.getElementById('chat-panel')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
      return;
    }

    const mark = target.closest<HTMLButtonElement>('[data-mark]');
    if (mark?.dataset.mark) {
      completed.add(mark.dataset.mark);
      saveCompletedIds(completed);
      rerender();
      return;
    }

    if (target.id === 'mark-all') {
      for (const step of steps) completed.add(step.id);
      saveCompletedIds(completed);
      rerender();
      return;
    }

    if (target.id === 'reset-demo') {
      completed.clear();
      saveCompletedIds(completed);
      rerender();
      mountChat(DEFAULT_CHAT);
    }
  });
}

async function boot(): Promise<void> {
  const loaded = await loadSteps();
  steps = loaded.steps;
  source = loaded.source;

  const sourceNote = document.getElementById('steps-source');
  if (sourceNote) {
    if (source === 'fixture') {
      sourceNote.textContent =
        'Showing fixture sample steps (?fixture=1). Not your instance’s checklist.';
    } else if (source === 'config') {
      sourceNote.textContent = 'Loaded steps from /steps.json.';
    } else {
      sourceNote.textContent =
        'No steps configured. Copy public/steps.example.json to public/steps.json, or open with ?fixture=1 for a sample.';
    }
  }

  mountChat(DEFAULT_CHAT);
  rerender();
  wireEvents();
}

void boot();
