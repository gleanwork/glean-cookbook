import { describe, expect, test, vi } from 'vitest';
import { resolveServerURL } from './login.js';

describe('resolveServerURL', () => {
  test('discovers the backend from a work email', async () => {
    const discover = vi.fn().mockResolvedValue({
      instance: 'acme',
      backend: 'https://acme-be.glean.com',
    });

    await expect(
      resolveServerURL({ email: 'person@example.com' }, discover),
    ).resolves.toBe('https://acme-be.glean.com');
    expect(discover).toHaveBeenCalledWith('person@example.com');
  });

  test('uses an explicit backend override without discovery', async () => {
    const discover = vi.fn();

    await expect(
      resolveServerURL({ serverURL: 'https://acme-be.glean.com/' }, discover),
    ).resolves.toBe('https://acme-be.glean.com');
    expect(discover).not.toHaveBeenCalled();
  });

  test('requires either an email or backend override', async () => {
    await expect(resolveServerURL({})).rejects.toThrow(
      'Pass --email to discover your Glean tenant',
    );
  });
});
