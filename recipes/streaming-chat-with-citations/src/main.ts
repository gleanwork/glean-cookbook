import { parseCliOptions } from './cli.js';
import { runChat } from './chat.js';
import { formatSdkError } from './errors.js';

try {
  await runChat(parseCliOptions());
} catch (error) {
  console.error(formatSdkError(error));
  process.exitCode = 1;
}
