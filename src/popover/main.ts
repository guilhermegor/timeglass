import { bootstrap } from './bootstrap.js';

void bootstrap(process.argv.slice(2), () => import('./entry.js'), process);
