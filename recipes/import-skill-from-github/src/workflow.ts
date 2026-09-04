import type { Glean } from '@gleanwork/api-client';
import { PreviewSourceAcceptEnum } from '@gleanwork/api-client/sdk/skills.js';
import type { PlatformSkillSourcePreviewResponse } from '@gleanwork/api-client/models/components';
import { PINNED_SOURCE_URL } from './fixture.js';
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

function githubFetchError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(
    `This tenant could not fetch GitHub: ${message}. The import recipe fails rather than skipping.`,
  );
}

export async function resolvePreview(
  api: SkillsApi,
  sourceUrl: string,
  stream: boolean,
): Promise<PlatformSkillSourcePreviewResponse> {
  try {
    const preview = await api.previewSource(
      { source_url: sourceUrl, stream },
      stream
        ? { acceptHeaderOverride: PreviewSourceAcceptEnum.textEventStream }
        : undefined,
    );
    return parsePreviewResult(preview);
  } catch (error) {
    throw githubFetchError(error);
  }
}

export async function importSkillFromGithub(
  api: SkillsApi,
  options: {
    sourceUrl?: string;
    stream?: boolean;
    cleanup: boolean;
    log?: (message: string) => void;
  },
): Promise<ImportResult> {
  const log = options.log ?? (() => undefined);
  const sourceUrl = options.sourceUrl?.trim() || PINNED_SOURCE_URL;
  const createdIds: string[] = [];

  try {
    log(`Previewing ${sourceUrl} without persisting a source...`);
    const preview = await resolvePreview(
      api,
      sourceUrl,
      options.stream === true,
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
      throw githubFetchError(error);
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
    const listed = await api.list(100);
    if (!listed.skills.some((item) => item.id === skill.id)) {
      throw new Error('List did not include the skill this run just imported.');
    }

    log(`Syncing imported skill ${skill.id} from its stored GitHub URL...`);
    let synced;
    try {
      synced = await api.sync(skill.id);
    } catch (error) {
      throw githubFetchError(error);
    }

    return {
      ids: [...createdIds],
      displayName: retrieved.skill.display_name,
      sourceUrl: selected.source_url,
      commitSha: synced.commit_sha,
      updated: synced.updated,
    };
  } finally {
    if (options.cleanup) {
      for (const id of createdIds) {
        log(`Deleting run-owned skill ${id}...`);
        try {
          await api.delete(id);
        } catch (error) {
          log(
            `Cleanup warning: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  }
}
