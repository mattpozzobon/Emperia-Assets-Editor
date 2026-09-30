import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { saveAssetsLocally } from './save-assets-local.mjs';

const testRoot = await mkdtemp(join(tmpdir(), 'emperia-save-test-'));
const current = join(testRoot, 'current');
await mkdir(current);

const oldSprite = Buffer.from('old sprite');
const newSprite = Buffer.from('new sprite payload');
const manifest = Buffer.from('{"schemaVersion":1}');
const artifact = (name, buffer) => ({
  name,
  buffer,
  sha256: createHash('sha256').update(buffer).digest('hex'),
});

try {
  await writeFile(join(current, 'emperia.espr'), oldSprite);
  await saveAssetsLocally({
    assetRoot: current,
    artifacts: [
      artifact('emperia.espr', newSprite),
      artifact('asset-package.json', manifest),
    ],
  });

  assert.deepEqual(await readFile(join(current, 'emperia.espr')), newSprite);
  assert.deepEqual(await readFile(join(current, 'asset-package.json')), manifest);
  assert.deepEqual(await readFile(join(current, 'backup', 'emperia.espr')), oldSprite);
  console.log('Local asset save transaction verified.');
} finally {
  const resolved = resolve(testRoot);
  assert.ok(resolved.startsWith(resolve(tmpdir())), 'Refusing to clean a non-temporary test directory.');
  await rm(resolved, { recursive: true, force: true });
}

