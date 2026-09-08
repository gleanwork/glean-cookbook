export const SAMPLE_BUNDLE = 'fixtures/sample-skill/SKILL.md';

export function persistBundlePath(flag?: string): string {
  return flag?.trim() || SAMPLE_BUNDLE;
}

export function verifyBundlePath(flag?: string): string | undefined {
  const trimmed = flag?.trim();
  return trimmed || undefined;
}
