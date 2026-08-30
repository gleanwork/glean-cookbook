#!/usr/bin/env node

import { discoverOAuth } from './glean-auth.mjs';
import { discoverBackend } from './tenant-discovery.mjs';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node resolve-backend.mjs <work-email>');
  process.exit(1);
}

try {
  const { instance, backend } = await discoverBackend(email);
  let oauthAvailable = false;
  try {
    await discoverOAuth(backend);
    oauthAvailable = true;
  } catch {
    // Backend discovery is still useful when OAuth is unavailable.
  }
  console.log(JSON.stringify({ instance, backend, oauthAvailable }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
