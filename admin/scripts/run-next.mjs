import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(adminRoot, 'package.json'));
const next = require.resolve('next/dist/bin/next');
const { status } = spawnSync(process.execPath, [next, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: adminRoot,
});
process.exit(status ?? 1);
