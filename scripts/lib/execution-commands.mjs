import { scaffoldOf } from './step-shell.mjs';

// check-recipe-commands runs a downloaded project's step commands in sequence.
// An execution command that is not one of those steps would escape that check,
// so it must be the exact command of the step it describes.
export function executionCommandErrors(execution, steps) {
  if (!steps.some((step) => step.command && scaffoldOf(step.command))) {
    return [];
  }
  const stepCommands = new Set(steps.map((step) => step.command));
  const commands = [
    ...(execution.auth ?? []).map((auth, index) => [
      `auth[${index}].setupCommand`,
      auth.setupCommand,
    ]),
    ['verification.command', execution.verification?.command],
    ['run.command', execution.run?.command],
  ];
  return commands
    .filter(([, command]) => command && !stepCommands.has(command))
    .map(
      ([field, command]) =>
        `${field} must be the exact command of one of its steps: ${command}`,
    );
}
