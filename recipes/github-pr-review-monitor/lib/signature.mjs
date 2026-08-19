import crypto from 'node:crypto';

export const demoSecret = 'whsec_Z2xlYW4tY29va2Jvb2stZ2l0aHViLXJldmlldy1kZW1v';

function keyFor(secret) {
  if (!secret.startsWith('whsec_')) {
    throw new Error('Standard Webhooks secrets must start with whsec_.');
  }
  return Buffer.from(secret.slice(6), 'base64');
}

export function sign(secret, webhookId, timestamp, body) {
  return crypto
    .createHmac('sha256', keyFor(secret))
    .update(`${webhookId}.${timestamp}.${body}`)
    .digest('base64');
}

export function verifySignature({
  secret,
  webhookId,
  timestamp,
  body,
  signatures,
}) {
  if (!secret.startsWith('whsec_')) return false;
  const expected = Buffer.from(sign(secret, webhookId, timestamp, body));
  return signatures.some((candidate) => {
    const actual = Buffer.from(candidate);
    return (
      actual.length === expected.length &&
      crypto.timingSafeEqual(actual, expected)
    );
  });
}

export function parseSignatureHeader(value = '') {
  return value
    .trim()
    .split(/\s+/u)
    .map((part) => part.split(',', 2))
    .filter(([version, signature]) => version === 'v1' && signature)
    .map(([, signature]) => signature);
}
