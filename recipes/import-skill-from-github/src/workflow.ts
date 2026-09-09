import type { Glean } from '@gleanwork/api-client';
import {
  GleanBaseError,
  PlatformProblemDetailError,
} from '@gleanwork/api-client/models/errors';
import { PreviewSourceAcceptEnum } from '@gleanwork/api-client/sdk/skills.js';
import type { PlatformSkillSourcePreviewResponse } from '@gleanwork/api-client/models/components';
import { CleanupFailedError, formatCliError } from './errors.js';
import { DEFAULT_SOURCE_URL } from './fixture.js';
import { parsePreviewResult } from './preview.js';

export type SkillsApi = Pick<
  Glean['skills'],
  'delete' | 'import' | 'list' | 'previewSource' | 'retrieve' | 'sync'
>;

export interface ImportResult {
  ids: string[];
  displayName: string;
  sourceUrl: string;
  commitSha: string;
  updated: boolean;
}

function rethrow(error: unknown): never {
  throw error instanceof Error ? error : new Error('Verification failed.');
}

export function cleanupCommand(
  skillId: string,
  auth: { email?: string; serverUrl?: string } = {},
) {
  const parts = [`npm start -- cleanup --id ${skillId} --yes`];
  if (auth.serverUrl?.trim()) {
    parts.push(`--server-url ${auth.serverUrl.trim()}`);
  } else if (auth.email?.trim()) {
    parts.push(`--email ${auth.email.trim()}`);
  } else {
    parts.push('--email <your-work-email>');
  }
  return parts.join(' ');
}

export function importedSuccessLine(result: ImportResult) {
  return `Imported ${result.displayName} (${result.ids.join(', ')}) from ${result.sourceUrl} at ${result.commitSha}; cleanup completed.`;
}

export function githubFetchStatusHint(status?: number) {
  if (status === 400) {
    return ' HTTP 400 means the Skills API rejected this source URL. Commit permalinks and SHA-pinned GitHub URLs are rejected; use a branch URL such as .../tree/main/.... Tenant policy can also refuse GitHub import.';
  }
  if (status === 503) {
    return ' HTTP 503 means GitHub fetch is temporarily unavailable. Retry later.';
  }
  return '';
}

function githubFetchError(error: unknown): Error {
  const summary = formatCliError(error).error;
  const status =
    error instanceof PlatformProblemDetailError
      ? error.status
      : error instanceof GleanBaseError
        ? error.statusCode
        : undefined;
  return new Error(
    `This tenant could not fetch GitHub: ${summary}.${githubFetchStatusHint(status)} The import recipe fails rather than skipping.`,
  );
}

function isSkillsApiNotFound(error: unknown) {
  if (error instanceof PlatformProblemDetailError) return error.status === 404;
  if (error instanceof GleanBaseError) return error.statusCode === 404;
  return false;
}

function reraiseSourceError(error: unknown): never {
  if (isSkillsApiNotFound(error)) throw error;
  if (
    error instanceof PlatformProblemDetailError ||
    error instanceof GleanBaseError
  ) {
    throw githubFetchError(error);
  }
  throw error instanceof Error ? error : new Error('Verification failed.');
}

export async function findSkillById(api: SkillsApi, skillId: string) {
  let cursor: string | undefined;
  do {
    const page = await api.list(100, cursor);
    if (page.skills.some((skill) => skill.id === skillId)) return true;
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return false;
}

export async function deleteCapturedIds(
  api: SkillsApi,
  ids: string[],
  log: (message: string) => void,
) {
  const remaining: string[] = [];
  for (const id of ids) {
    log(`Deleting run-owned skill ${id}...`);
    try {
      await api.delete(id);
    } catch {
      remaining.push(id);
    }
  }
  return remaining;
}

export async function resolvePreview(
  api: SkillsApi,
  sourceUrl: string,
  stream: boolean,
  log: (message: string) => void = () => undefined,
): Promise<PlatformSkillSourcePreviewResponse> {
  try {
    const preview = await api.previewSource(
      { source_url: sourceUrl, stream },
      stream
        ? { acceptHeaderOverride: PreviewSourceAcceptEnum.textEventStream }
        : undefined,
    );
    return parsePreviewResult(preview, log);
  } catch (error) {
    reraiseSourceError(error);
  }
}

export async function importSkillFromGithub(
  api: SkillsApi,
  options: {
    sourceUrl?: string;
    stream?: boolean;
    cleanup: boolean;
    auth?: { email?: string; serverUrl?: string };
    log?: (message: string) => void;
  },
): Promise<ImportResult> {
  const log = options.log ?? (() => undefined);
  const sourceUrl = options.sourceUrl?.trim() || DEFAULT_SOURCE_URL;
  const createdIds: string[] = [];
  let result: ImportResult | undefined;
  let workError: unknown;

  try {
    log(`Previewing ${sourceUrl} without persisting a source...`);
    const preview = await resolvePreview(
      api,
      sourceUrl,
      options.stream === true,
      log,
    );
    const selected = preview.skills.at(0);
    if (!selected) {
      const failures = preview.failures
        .map((failure) => `${failure.code}: ${failure.detail}`)
        .join('; ');
      throw new Error(
        failures
          ? `GitHub preview returned no importable skills (${failures}).`
          : 'GitHub preview returned no importable skills.',
      );
    }

    log(`Importing ${selected.source_url}...`);
    let imported;
    try {
      imported = await api.import({ source_urls: [selected.source_url] });
    } catch (error) {
      reraiseSourceError(error);
    }
    const skill = imported.skills.at(0);
    if (!skill) {
      throw new Error('Import returned no skills.');
    }
    createdIds.push(...imported.skills.map((item) => item.id));

    log('Confirming get and list return the imported skill...');
    const retrieved = await api.retrieve(skill.id);
    if (retrieved.skill.id !== skill.id) {
      throw new Error('Direct retrieval returned a different skill.');
    }
    if (!(await findSkillById(api, skill.id))) {
      throw new Error('List did not include the skill this run just imported.');
    }

    log(`Syncing imported skill ${skill.id} from its stored GitHub URL...`);
    let synced;
    try {
      synced = await api.sync(skill.id);
    } catch (error) {
      reraiseSourceError(error);
    }

    result = {
      ids: [...createdIds],
      displayName: retrieved.skill.display_name,
      sourceUrl: selected.source_url,
      commitSha: synced.commit_sha,
      updated: synced.updated,
    };
  } catch (error) {
    workError = error;
  }

  const remaining = options.cleanup
    ? await deleteCapturedIds(api, createdIds, log)
    : [];
  if (remaining.length > 0) {
    throw new CleanupFailedError(
      remaining,
      remaining.map((id) => cleanupCommand(id, options.auth)).join('\n  '),
      workError,
    );
  }
  if (workError) rethrow(workError);
  if (!result) throw new Error('Verification did not produce a result.');
  return result;
}
