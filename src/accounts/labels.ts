import {
  labelsPath,
  readJsonObject,
  writeJsonObject,
  type PathOptions,
} from '../cache/json-file.js';
import { NULL_EMITTER, type LogEmitter } from '../utils/log-emitter.js';

/** Account name -> human label. */
export type Labels = Record<string, string>;

/** Reads labels; non-string values and a corrupt file are dropped. Never throws. */
export function readLabels(opts: PathOptions = {}, log: LogEmitter = NULL_EMITTER): Labels {
  const raw = readJsonObject(labelsPath(opts), log);
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

/** Sets (or, for an empty label, clears) one account's label. Returns false if the write failed. */
export function setLabel(
  account: string,
  label: string,
  opts: PathOptions = {},
  log: LogEmitter = NULL_EMITTER,
): boolean {
  const labels = readLabels(opts, log);
  const trimmed = label.trim();
  if (trimmed === '') delete labels[account];
  else labels[account] = trimmed;
  return writeJsonObject(labelsPath(opts), labels, log);
}

/**
 * Moves a label to a renamed account. No-op (true) when the old account has no label;
 * false when the write failed or the new name already carries a different label.
 */
export function renameLabel(
  oldName: string,
  newName: string,
  opts: PathOptions = {},
  log: LogEmitter = NULL_EMITTER,
): boolean {
  const labels = readLabels(opts, log);
  const label = labels[oldName];
  if (label === undefined) return true;
  if (newName in labels && newName !== oldName) return false;
  delete labels[oldName];
  labels[newName] = label;
  return writeJsonObject(labelsPath(opts), labels, log);
}
