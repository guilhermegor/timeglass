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

export function findPackageRoot(start: string): string {
  let dir = path.dirname(fs.realpathSync(start));
  while (!isPackageRoot(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Cannot locate the ${PACKAGE_NAME} package from ${start}.`);
    dir = parent;
  }
  return dir;
}

export function defaultExtensionsDir(env: NodeJS.ProcessEnv = process.env): string {
  const data = env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(data, 'gnome-shell', 'extensions');
}

export function installExtension(options: InstallExtensionOptions = {}): InstallExtensionResult {
  const root = options.packageRoot ?? findPackageRoot(process.argv[1] ?? '');
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
  fs.writeFileSync(path.join(staging, HELPER_FILE), `${JSON.stringify({ main })}\n`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(staging, target);
  const enableCommand = `gnome-extensions enable ${EXTENSION_UUID}`;
  return {
    installedTo: target,
    enableCommand,
    instructions:
      `Installed to ${target}.\nLog out and back in (Wayland) or restart GNOME Shell (X11), ` +
      `then run: ${enableCommand}`,
  };
}
