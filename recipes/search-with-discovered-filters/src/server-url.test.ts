import { describe, expect, test } from 'vitest';
import { parseGleanServerURL } from './server-url.js';

describe('parseGleanServerURL', () => {
  test('accepts a canonical Glean backend', () => {
    expect(parseGleanServerURL('https://acme-be.glean.com/').origin).toBe(
      'https://acme-be.glean.com',
    );
  });

  test.each([
    'https://attacker.example/',
    'https://acme-be.glean.com.attacker.example/',
    'http://acme-be.glean.com/',
    'https://acme-be.glean.com:8443/',
    'https://acme-be.glean.com/search',
  ])('rejects an unsafe backend URL: %s', (serverURL) => {
    expect(() => parseGleanServerURL(serverURL)).toThrow(
      'Use a Glean backend URL',
    );
  });

  test('allows an HTTP loopback server only when requested', () => {
    expect(() => parseGleanServerURL('http://127.0.0.1:3210/')).toThrow();
    expect(
      parseGleanServerURL('http://127.0.0.1:3210/', {
        allowLoopback: true,
      }).href,
    ).toBe('http://127.0.0.1:3210/');
  });
});
