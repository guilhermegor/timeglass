#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { defaultAccountsDir } from '../store/account-store.js';
import { CONSOLE_EMITTER } from '../utils/log-emitter.js';

import { runCli } from './main.js';

function readVersion(): string {
  const file = path.join(__dirname, '..', '..', '..', 'package.json');
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  return String((parsed as { version?: unknown }).version ?? 'unknown');
}

runCli({
  argv: process.argv.slice(2),
  version: readVersion(),
  dir: defaultAccountsDir(),
  logger: CONSOLE_EMITTER,
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
}).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'unexpected error'}\n`);
    process.exitCode = 1;
  },
);
