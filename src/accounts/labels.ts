import {
  labelsPath,
  readJsonObject,
  readJsonObjectOrNull,
  writeJsonObject,
  type JsonObject,
  type PathOptions,
} from '../cache/json-file.js';
import { NULL_EMITTER, type LogEmitter } from '../utils/log-emitter.js';

export type Labels = Record<string, string>;

export function readLabels(opts: PathOptions = {}, log: LogEmitter = NULL_EMITTER): Labels {
  const raw = readJsonObject(labelsPath(opts), log);
  const labels: Labels = Object.create(null) as Labels;
  for (const [account, label] of Object.entries(raw)) {
    if (typeof label === 'string') labels[account] = label;
  }
  return labels;
}

function readEditableLabels(opts: PathOptions, log: LogEmitter): JsonObject | null {
  const raw = readJsonObjectOrNull(labelsPath(opts), log);
  return raw === null ? null : Object.assign(Object.create(null) as JsonObject, raw);
}

export function setLabel(
  account: string,
  label: string,
  opts: PathOptions = {},
  log: LogEmitter = NULL_EMITTER,
): boolean {
  const labels = readEditableLabels(opts, log);
  if (labels === null) return false;
  const trimmed = label.trim();
  if (trimmed === '') delete labels[account];
  else labels[account] = trimmed;
  return writeJsonObject(labelsPath(opts), labels, log);
}

export function renameLabel(
  oldName: string,
  newName: string,
  opts: PathOptions = {},
  log: LogEmitter = NULL_EMITTER,
): boolean {
  const labels = readEditableLabels(opts, log);
  if (labels === null) return false;
  const label = labels[oldName];
  if (typeof label !== 'string') return true;
  const existing = labels[newName];
  if (existing !== undefined && existing !== label) return false;
  delete labels[oldName];
  labels[newName] = label;
  return writeJsonObject(labelsPath(opts), labels, log);
}
