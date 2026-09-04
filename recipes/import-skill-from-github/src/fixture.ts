export const PINNED_SOURCE_URL =
  'https://github.com/anthropics/skills/tree/41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f/skills/skill-creator';

export const PREVIEW_FIXTURE = {
  skills: [
    {
      display_name: 'skill-creator',
      description: 'Guide for creating effective skills.',
      source_url: PINNED_SOURCE_URL,
      commit_sha: 'fixture-commit-sha',
      main_content:
        '---\nname: skill-creator\ndescription: Guide for creating effective skills.\n---\n',
      files: [],
      file_tree: ['SKILL.md'],
    },
  ],
  failures: [],
  request_id: 'request-preview-fixture',
};

export function githubSkillFixture(id = 'skill-imported') {
  return {
    id,
    display_name: 'skill-creator',
    description: 'Guide for creating effective skills.',
    latest_version: 1,
    latest_minor_version: 0,
    status: 'DRAFT',
    origin: 'CUSTOM',
    source_provenance: {
      source_url: PINNED_SOURCE_URL,
      commit_sha: 'fixture-commit-sha',
      imported_at: '2026-09-04T00:00:00.000Z',
      last_synced_at: '2026-09-04T00:00:00.000Z',
      sync_status: 'UP_TO_DATE',
    },
    owner: { name: 'Fixture User' },
    created_at: '2026-09-04T00:00:00.000Z',
    updated_at: '2026-09-04T00:00:00.000Z',
  };
}
