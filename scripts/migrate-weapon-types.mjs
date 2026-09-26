import { createHash } from 'node:crypto';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const sourceArg = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
if (!sourceArg) {
  throw new Error('Usage: npm run migrate:weapon-types -- <items.json> [--write]');
}

const sourcePath = resolve(sourceArg);
const write = process.argv.includes('--write');
const document = JSON.parse(await readFile(sourcePath, 'utf8'));
const forceLegacy = process.argv.includes('--force-legacy');
const legacyNames = new Set(['distance', 'ammunition', 'fist', 'melee', 'ranged', 'magical', 'rod']);
const hasLegacyMarker = Object.values(document).some((definition) => {
  const raw = definition?.properties?.['10'];
  return raw === 11 || legacyNames.has(raw);
});
if (!hasLegacyMarker && !forceLegacy) {
  throw new Error('Input does not look like the legacy weapon contract; refusing a second migration.');
}
let changed = 0;

function ammoName(raw) {
  if (raw === 1 || raw === 'arrow') return 'arrow';
  if (raw === 2 || raw === 'bolt') return 'bolt';
  return '';
}

function migrateWeaponType(raw, ammo, itemId) {
  const oldName = typeof raw === 'string'
    ? raw
    : ['', 'sword', 'axe', 'club', 'distance', 'orb', 'shield', 'ammunition', 'fist', 'melee', 'ranged', 'staff'][raw];
  switch (oldName) {
    case undefined:
    case '': return '';
    case 'sword':
    case 'axe':
    case 'club':
    case 'orb':
    case 'shield':
    case 'staff': return oldName;
    case 'distance': {
      const normalizedAmmo = ammoName(ammo);
      // The canonical contract has no generic thrown-weapon category. Retire
      // legacy spears/stars/knives that have no arrow or bolt contract.
      if (!normalizedAmmo) return '';
      return normalizedAmmo === 'bolt' ? 'crossbow' : 'bow';
    }
    case 'wand':
    case 'rod': return 'wand';
    case 'ammunition':
      if (!ammoName(ammo)) throw new Error(`Item ${itemId}: ammunition has no arrow/bolt ammoType.`);
      return '';
    case 'fist':
    case 'melee':
    case 'ranged':
    case 'magical':
      throw new Error(`Item ${itemId}: retired weaponType "${oldName}" needs an explicit replacement.`);
    default:
      throw new Error(`Item ${itemId}: unknown weaponType "${String(raw)}".`);
  }
}

const newCode = new Map([
  ['', 0], ['sword', 1], ['axe', 2], ['club', 3], ['bow', 4],
  ['crossbow', 5], ['short_bow', 6], ['orb', 7], ['shield', 8], ['staff', 9], ['wand', 10],
]);

for (const [itemId, definition] of Object.entries(document)) {
  const properties = definition?.properties;
  if (!properties || properties['10'] === undefined) continue;
  const migrated = migrateWeaponType(properties['10'], properties['12'], itemId);
  const encoded = newCode.get(migrated);
  if (encoded === undefined) throw new Error(`Item ${itemId}: cannot encode weaponType "${migrated}".`);
  if (encoded === 0) delete properties['10'];
  else properties['10'] = encoded;
  if (migrated === 'orb' && properties['15'] === undefined) properties['15'] = 7;
  else if (migrated !== 'orb') delete properties['15'];
  changed++;
}

if (write) {
  const backupPath = `${sourcePath}.pre-weapon-contract.bak`;
  await copyFile(sourcePath, backupPath);
  await writeFile(sourcePath, `${JSON.stringify(document, null, 4)}\n`, 'utf8');

  const manifestPath = join(dirname(sourcePath), 'asset-package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const name of Object.keys(manifest.files ?? {})) {
    const bytes = await readFile(join(dirname(sourcePath), name));
    manifest.files[name] = {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      size: bytes.byteLength,
    };
  }
  const identity = Object.entries(manifest.files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, file]) => `${name}:${file.sha256}:${file.size}`)
    .join('\n');
  manifest.packageId = createHash('sha256').update(identity).digest('hex');
  manifest.generatedAt = new Date().toISOString();
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ backupPath, packageId: manifest.packageId }));
}
console.log(JSON.stringify({ sourcePath, changed, written: write }));
