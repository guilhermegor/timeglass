import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { EXTENSION_UUID, findPackageRoot, installExtension } from './install-extension.js';

function makePackage(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pkg-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"timeglass"}');
  fs.mkdirSync(path.join(root, 'extension', 'icons'), { recursive: true });
  fs.writeFileSync(path.join(root, 'extension', 'metadata.json'), '{}');
  fs.writeFileSync(path.join(root, 'extension', 'icons', 'a.svg'), '<svg/>');
  fs.mkdirSync(path.join(root, 'dist', 'esm', 'popover'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'esm', 'popover', 'main.js'), '');
  return root;
}

describe('installExtension', () => {
  it('copies the extension and records the helper path', () => {
    const packageRoot = makePackage();
    const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-ext-'));
    const result = installExtension({ packageRoot, targetRoot });
    const target = path.join(targetRoot, EXTENSION_UUID);
    expect(result.installedTo).toBe(target);
    expect(fs.existsSync(path.join(target, 'icons', 'a.svg'))).toBe(true);
    const helper = JSON.parse(fs.readFileSync(path.join(target, 'helper.json'), 'utf8')) as {
      main: string;
    };
    expect(helper.main).toBe(path.join(packageRoot, 'dist', 'esm', 'popover', 'main.js'));
    expect(result.instructions).toContain(`gnome-extensions enable ${EXTENSION_UUID}`);
  });

  it('keeps the working install when the new copy fails', () => {
    const packageRoot = makePackage();
    fs.rmSync(path.join(packageRoot, 'dist'), { recursive: true });
    const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-ext-'));
    const kept = path.join(targetRoot, EXTENSION_UUID, 'kept.txt');
    fs.mkdirSync(path.dirname(kept), { recursive: true });
    fs.writeFileSync(kept, 'x');
    expect(() => installExtension({ packageRoot, targetRoot })).toThrow(/Run the build first/);
    expect(fs.existsSync(kept)).toBe(true);
    expect(fs.existsSync(`${path.dirname(kept)}.new`)).toBe(false);
  });

  it('replaces a previous install instead of merging into it', () => {
    const packageRoot = makePackage();
    const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-ext-'));
    const stale = path.join(targetRoot, EXTENSION_UUID, 'stale.txt');
    fs.mkdirSync(path.dirname(stale), { recursive: true });
    fs.writeFileSync(stale, 'x');
    installExtension({ packageRoot, targetRoot });
    expect(fs.existsSync(stale)).toBe(false);
  });

  it('fails when the build output is missing', () => {
    const packageRoot = makePackage();
    fs.rmSync(path.join(packageRoot, 'dist'), { recursive: true });
    expect(() => installExtension({ packageRoot, targetRoot: os.tmpdir() })).toThrow(/build/);
  });

  it('fails when the extension files are missing', () => {
    const packageRoot = makePackage();
    fs.rmSync(path.join(packageRoot, 'extension'), { recursive: true });
    expect(() => installExtension({ packageRoot, targetRoot: os.tmpdir() })).toThrow(/not found/);
  });
});

describe('findPackageRoot', () => {
  it('walks up to the timeglass package.json', () => {
    const root = makePackage();
    const deep = path.join(root, 'dist', 'esm', 'popover', 'main.js');
    expect(findPackageRoot(deep)).toBe(fs.realpathSync(root));
  });

  it('throws outside the package', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-none-'));
    fs.writeFileSync(path.join(other, 'x.js'), '');
    expect(() => findPackageRoot(path.join(other, 'x.js'))).toThrow(/Cannot locate/);
  });
});

describe('installExtension paths', () => {
  it('writes an absolute helper path even when packageRoot is relative', () => {
    const packageRoot = makePackage();
    const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-ext-'));
    const result = installExtension({
      packageRoot: path.relative(process.cwd(), packageRoot),
      targetRoot,
    });
    const helper = JSON.parse(
      fs.readFileSync(path.join(result.installedTo, 'helper.json'), 'utf8'),
    ) as { main: string };
    expect(path.isAbsolute(helper.main)).toBe(true);
    expect(helper.main).toBe(path.join(packageRoot, 'dist', 'esm', 'popover', 'main.js'));
  });
});
