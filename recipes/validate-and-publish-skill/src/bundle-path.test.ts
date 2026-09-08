import { expect, test } from 'vitest';
import {
  persistBundlePath,
  SAMPLE_BUNDLE,
  verifyBundlePath,
} from './bundle-path.js';

test('npm start defaults to the sample SKILL.md', () => {
  expect(persistBundlePath(undefined)).toBe(SAMPLE_BUNDLE);
  expect(persistBundlePath('')).toBe(SAMPLE_BUNDLE);
  expect(persistBundlePath(' path/to/SKILL.md ')).toBe('path/to/SKILL.md');
});

test('npm run verify generates a unique file unless --bundle is passed', () => {
  expect(verifyBundlePath(undefined)).toBeUndefined();
  expect(verifyBundlePath('')).toBeUndefined();
  expect(verifyBundlePath(' path/to/SKILL.md ')).toBe('path/to/SKILL.md');
});
