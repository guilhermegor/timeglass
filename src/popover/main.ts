import { runPopoverCommand } from './entry.js';

void runPopoverCommand(process.argv.slice(2)).then((result) => {
  if (result.stdout) process.stdout.write(`${result.stdout}\n`);
  if (result.stderr) process.stderr.write(`${result.stderr}\n`);
  process.exitCode = result.code;
});
