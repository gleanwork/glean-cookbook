import meow from 'meow';

export function parseCliOptions(argv = process.argv.slice(2)) {
  const cli = meow(
    `
      Usage
        $ npm start -- --prompt <text> [options]

      Options
        --email           Work email used to discover the Glean backend
        --server-url      Complete Glean backend origin; overrides --email
        --prompt, -p      Message to send to Glean Chat
        --follow-up, -f   Optional follow-up sent in the same conversation

      Example
        $ npm start -- --email you@example.com --prompt "What is our PTO policy?"
    `,
    {
      importMeta: import.meta,
      argv,
      flags: {
        email: { type: 'string' },
        serverUrl: { type: 'string' },
        prompt: { type: 'string', shortFlag: 'p', isRequired: true },
        followUp: { type: 'string', shortFlag: 'f' },
      },
    },
  );

  if (cli.input.length > 0) {
    throw new Error(`Unexpected argument: ${cli.input[0]}`);
  }

  const email = cli.flags.email?.trim();
  const serverUrl = cli.flags.serverUrl?.trim();
  const prompt = cli.flags.prompt.trim();
  const followUp = cli.flags.followUp?.trim();

  if (cli.flags.email !== undefined && !email) {
    throw new Error('--email must not be blank.');
  }
  if (cli.flags.serverUrl !== undefined && !serverUrl) {
    throw new Error('--server-url must not be blank.');
  }
  if (!prompt) throw new Error('--prompt must not be blank.');
  if (cli.flags.followUp !== undefined && !followUp) {
    throw new Error('--follow-up must not be blank.');
  }

  return { email, followUp, prompt, serverUrl };
}
