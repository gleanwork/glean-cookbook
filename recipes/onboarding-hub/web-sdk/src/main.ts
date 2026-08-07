import { renderChat } from '@gleanwork/web-sdk';
import type { ChatHandle, WebSdkChatEvent } from '@gleanwork/web-sdk';
import {
  buildContextPrompt,
  loadCompletedIds,
  loadResources,
  loadSteps,
  MILESTONE_LABELS,
  progressPercent,
  milestoneStats,
  saveCompletedIds,
  isStepDone,
  type OnboardingResource,
  type OnboardingStep,
} from './checklist';

const completed = loadCompletedIds();
let steps: OnboardingStep[] = [];
let resources: OnboardingResource[] = [];
let source: 'config' | 'missing' | 'error' = 'missing';
let stepsError: string | undefined;
let gleanBackend = '';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

let currentChatId: string | undefined;
let chatHandle: ChatHandle | undefined;

function loadBackend(): string {
  const configured = import.meta.env.VITE_GLEAN_BACKEND?.trim();
  if (!configured) {
    throw new Error(
      'Set VITE_GLEAN_BACKEND in .env.local, then restart the dev server.',
    );
  }

  let backend: URL;
  try {
    backend = new URL(configured);
  } catch {
    throw new Error(
      'VITE_GLEAN_BACKEND must be an absolute URL such as https://example-be.glean.com.',
    );
  }
  if (
    backend.protocol !== 'https:' ||
    backend.username ||
    backend.password ||
    backend.pathname !== '/' ||
    backend.search ||
    backend.hash
  ) {
    throw new Error(
      'VITE_GLEAN_BACKEND must be an HTTPS origin with no path, query, or credentials.',
    );
  }
  return backend.origin;
}

function showChatConfigurationError(message: string): void {
  const container = document.getElementById('chat');
  if (!container) throw new Error('Missing #chat container');
  container.innerHTML = `<p class="config-error"><strong>Glean configuration needed.</strong><br>${escapeHtml(message)}</p>`;
}

function rememberChatId(event: WebSdkChatEvent): void {
  if (event.name === 'chat:location_update' && event.id)
    currentChatId = event.id;
  if (event.name === 'chat:id_update' && event.chatId) {
    currentChatId = event.chatId;
  }
}

function mountChat(
  initialMessage?: string,
  { continueConversation = false } = {},
): void {
  if (!gleanBackend) {
    showChatConfigurationError(
      'Set VITE_GLEAN_BACKEND in .env.local, then restart the dev server.',
    );
    return;
  }
  const container = document.getElementById('chat');
  if (!container) throw new Error('Missing #chat container');

  chatHandle?.off('chat:location_update', rememberChatId);
  chatHandle?.off('chat:id_update', rememberChatId);

  const resumeId = continueConversation ? currentChatId : undefined;
  if (!continueConversation) currentChatId = undefined;

  container.innerHTML = '';
  chatHandle = renderChat(container, {
    backend: gleanBackend,
    ...(resumeId ? { chatId: resumeId } : {}),
    ...(initialMessage ? { initialMessage } : {}),
  });

  chatHandle.on('chat:location_update', rememberChatId);
  chatHandle.on('chat:id_update', rememberChatId);
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
  const title = escapeHtml(step.title);
  const id = escapeHtml(step.id);
  const due = step.dueDate
    ? `<span class="due">Due ${escapeHtml(step.dueDate)}</span>`
    : '';
  const askButton = done
    ? ''
    : `<button type="button" class="ask-btn" data-ask="${encodeURIComponent(step.askPrompt)}">Ask about this</button>`;
  const markButton = done
    ? ''
    : `<button type="button" class="mark-btn" data-mark="${id}">Mark complete</button>`;
  return `
    <li class="step${done ? ' done' : ''}" data-step="${id}">
      <span class="check" aria-hidden="true">${done ? '✓' : '○'}</span>
      <div class="step-body">
        <div class="step-title">${title} ${due}</div>
        <div class="step-actions">${askButton}${markButton}</div>
      </div>
    </li>`;
}

function renderDoneResources(): void {
  const list = document.getElementById('done-resources');
  const emptyNote = document.getElementById('done-resources-empty');
  if (!list || !emptyNote) return;

  list.innerHTML = resources
    .map(
      (resource) =>
        `<a href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(resource.title)}</a>`,
    )
    .join('');
  emptyNote.hidden = resources.length > 0;
}

function renderChecklist(): void {
  const checklist = document.getElementById('checklist-panel');
  const donePanel = document.getElementById('done-panel');
  if (!checklist || !donePanel) return;

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
  renderDoneResources();
}

function wireEvents(): void {
  document.body.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const ask = target.closest<HTMLButtonElement>('[data-ask]');
    if (ask?.dataset.ask) {
      const prompt = decodeURIComponent(ask.dataset.ask);
      mountChat(prompt, { continueConversation: true });
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

    if (target.closest('#mark-all')) {
      for (const step of steps) completed.add(step.id);
      saveCompletedIds(completed);
      rerender();
      return;
    }

    if (target.closest('[data-reset]')) {
      completed.clear();
      saveCompletedIds(completed);
      rerender();
      mountChat(buildContextPrompt(steps, completed));
    }
  });
}

async function boot(): Promise<void> {
  const [loaded, loadedResources] = await Promise.all([
    loadSteps(),
    loadResources(),
  ]);
  steps = loaded.steps;
  source = loaded.source;
  stepsError = loaded.error;
  resources = loadedResources;

  const sourceNote = document.getElementById('steps-source');
  if (sourceNote) {
    if (source === 'config') {
      sourceNote.hidden = true;
      sourceNote.textContent = '';
    } else if (source === 'error') {
      sourceNote.hidden = false;
      sourceNote.textContent = `Checklist configuration error: ${stepsError ?? 'Fix public/steps.json and reload.'}`;
    } else {
      sourceNote.hidden = false;
      sourceNote.textContent =
        'No checklist is configured. Copy public/steps.example.json to public/steps.json, customize it, and reload.';
    }
  }

  rerender();
  wireEvents();

  try {
    gleanBackend = loadBackend();
  } catch (error) {
    showChatConfigurationError((error as Error).message);
    return;
  }

  mountChat(buildContextPrompt(steps, completed));
}

void boot();
