import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(backendRoot, 'package.json'));
const nest = require.resolve('@nestjs/cli/bin/nest.js');
const { status } = spawnSync(process.execPath, [nest, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: backendRoot,
});
process.exit(status ?? 1);
