import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export const perf_hooks = require('perf_hooks');
export const path = require('path');
export const os = require('os');
export const child_process = require('child_process');