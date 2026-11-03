import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const EXTENSION_UUID = 'timeglass@guilhermegor';
const PACKAGE_NAME = 'timeglass';
const HELPER_FILE = 'helper.json';

export interface InstallExtensionOptions {
  packageRoot?: string;
  targetRoot?: string;
}

export interface InstallExtensionResult {
  installedTo: string;
  enableCommand: string;
  instructions: string;
}

function isPackageRoot(dir: string): boolean {
  try {
    const raw = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
    return (JSON.parse(raw) as { name?: unknown }).name === PACKAGE_NAME;
  } catch {
    return false;
  }
}

export function findPackageRoot(start: string | undefined): string {
  if (!start) throw new Error(`Cannot locate the ${PACKAGE_NAME} package: no entry script.`);
  let dir = path.dirname(fs.realpathSync(start));
  while (!isPackageRoot(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Cannot locate the ${PACKAGE_NAME} package from ${start}.`);
    dir = parent;
  }
  return dir;
}

export function defaultExtensionsDir(env: NodeJS.ProcessEnv = process.env): string {
  const xdg = env.XDG_DATA_HOME;
  const data =
    xdg && path.isAbsolute(xdg)
      ? xdg
      : path.join(env.HOME || os.homedir(), '.local', 'share');
  return path.join(data, 'gnome-shell', 'extensions');
}

function swapInto(target: string, staging: string): void {
  const previous = `${target}.old`;
  fs.rmSync(previous, { recursive: true, force: true });
  const hadPrevious = fs.existsSync(target);
  if (hadPrevious) fs.renameSync(target, previous);
  try {
    fs.renameSync(staging, target);
  } catch (error: unknown) {
    if (hadPrevious) fs.renameSync(previous, target);
    throw error;
  }
  fs.rmSync(previous, { recursive: true, force: true });
}

export function installExtension(options: InstallExtensionOptions = {}): InstallExtensionResult {
  const root = path.resolve(options.packageRoot ?? findPackageRoot(process.argv[1]));
  const source = path.join(root, 'extension');
  const main = path.join(root, 'dist', 'esm', 'popover', 'main.js');
  if (!fs.existsSync(path.join(source, 'metadata.json'))) {
    throw new Error(`Extension files not found at ${source}.`);
  }
  if (!fs.existsSync(main)) throw new Error(`Run the build first: ${main} is missing.`);
  const target = path.join(options.targetRoot ?? defaultExtensionsDir(), EXTENSION_UUID);
  const staging = `${target}.new`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.cpSync(source, staging, { recursive: true });
  fs.writeFileSync(path.join(staging, HELPER_FILE), `${JSON.stringify({ main, node: process.execPath })}\n`);
  swapInto(target, staging);
  const enableCommand = `gnome-extensions enable ${EXTENSION_UUID}`;
  return {
    installedTo: target,
    enableCommand,
    instructions:
      `Installed to ${target}.\nLog out and back in (Wayland) or restart GNOME Shell (X11), ` +
      `then run: ${enableCommand}`,
  };
}
