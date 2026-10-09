// Local repair only; does not publish assets or modify authored NPC/monster IDs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
require('../../Emperia-Client/scripts/test-support/register-client-typescript.cjs');
const { parseObjectData } = require('../src/lib/object-parser.ts');
const { compileObjectData } = require('../src/lib/object-writer.ts');
const ObjectBuffer = require('../../Emperia-Client/client/src/engine/core/object-buffer.ts').default;

async function main() {
  const root = path.resolve(__dirname, '../../Emperia-Assets/current');
  const filename = path.join(root, 'emperia.eobj');
  const source = fs.readFileSync(filename);
  const buffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const data = parseObjectData(buffer);
  const oldCount = source.readUInt16LE(24);
  if (oldCount === data.equipmentCount) {
    console.log('Equipment indices are already restored; no files changed.');
    return;
  }
  assert.equal(oldCount, 183);
  assert.equal(data.equipmentCount, 186);
  const compiled = Buffer.from(compileObjectData(data));
  const oldObjects = new ObjectBuffer(); oldObjects.__load('before.eobj', buffer);
  const newObjects = new ObjectBuffer(); newObjects.__load('after.eobj', compiled.buffer.slice(compiled.byteOffset, compiled.byteOffset + compiled.byteLength));
  for (let index = 1; index <= oldCount; index++) {
    const restored = index >= 75 ? index + 3 : index;
    assert.deepEqual(newObjects.getEquipment(restored).frameGroups, oldObjects.getEquipment(index).frameGroups, `Equipment runtime index ${restored}`);
  }
  for (const index of [75, 76, 77]) assert.ok(newObjects.getEquipment(index).frameGroups.every(group => group.sprites.every(sprite => sprite === 0)));
  for (let id = 1; id <= data.attachmentCount; id++) assert.deepEqual(newObjects.getAttachment(id).frameGroups, oldObjects.getAttachment(id).frameGroups);
  assert.equal(parseObjectData(compiled.buffer.slice(compiled.byteOffset, compiled.byteOffset + compiled.byteLength)).equipmentCount, 186);

  const manifestPath = path.join(root, 'asset-package.json');
  const manifestSource = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestSource);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  manifest.files['emperia.eobj'] = { sha256: hash(compiled), size: compiled.length };
  const identity = Object.entries(manifest.files).sort(([left], [right]) => left.localeCompare(right))
    .map(([name, file]) => `${name}:${file.sha256}:${file.size}`).join('\n');
  manifest.packageId = hash(identity);
  manifest.generatedAt = new Date().toISOString();
  const backup = path.join(root, 'backup', `equipment-indices-${Date.now()}`);
  fs.mkdirSync(backup, { recursive: true });
  fs.writeFileSync(path.join(backup, 'emperia.eobj'), source);
  fs.writeFileSync(path.join(backup, 'asset-package.json'), manifestSource);
  // Detect another editor saving while the repair was being prepared.
  assert.equal(hash(fs.readFileSync(filename)), hash(source), 'Assets changed during repair; retry against the latest file.');
  assert.equal(hash(fs.readFileSync(manifestPath)), hash(manifestSource), 'Manifest changed during repair.');
  const { saveAssetsLocally } = await import('./save-assets-local.mjs');
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await saveAssetsLocally({ assetRoot: root, artifacts: [
    { name: 'emperia.eobj', buffer: compiled, sha256: hash(compiled) },
    { name: 'asset-package.json', buffer: manifestBytes, sha256: hash(manifestBytes) },
  ] });
  console.log(JSON.stringify({ equipmentCount: data.equipmentCount, emptyEquipment: [74, 75, 76], attachmentCount: data.attachmentCount, backup, packageId: manifest.packageId }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
