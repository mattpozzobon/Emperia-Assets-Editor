import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { parseObjectData } from '../src/lib/object-parser';
import { compileObjectData } from '../src/lib/object-writer';
import { compileSpriteData } from '../src/lib/sprite-writer';
import { maybeDecompress, gzipCompress } from '../src/lib/emperia-format';
import { MATERIAL_MASK_COLORS, collectMaterialMaskSpriteIds, remapMaterialMaskSpriteIds } from '../src/lib/material-mask';
import { getColorMaskLayer } from './legacy-outfit-colors';
import { COLOR_MASK_CHANNEL_ORDER, inspectColorMask, remapColorMaskPixels } from './legacy-color-mask-migration';
import type { ColorMaskChannel } from './legacy-color-mask-migration';

// The decoder also exposes browser preview helpers; this CLI uses only binary decoding.
globalThis.document = { createElement: () => ({ getContext: () => null }) } as unknown as Document;
globalThis.ImageData = class {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace = 'srgb' as const;
  constructor(data: Uint8ClampedArray | number, width: number, height?: number) {
    this.width = typeof data === 'number' ? data : width;
    this.height = typeof data === 'number' ? width : height!;
    this.data = typeof data === 'number' ? new Uint8ClampedArray(this.width * this.height * 4) : data;
  }
} as typeof ImageData;
const { parseSpriteData, decodeSprite } = await import('../src/lib/sprite-decoder');

const source = path.resolve(process.argv[2] ?? '../Emperia-Assets/current');
const destination = path.resolve(process.argv[3] ?? `../Emperia-Assets/migrations/two-color-regions-${new Date().toISOString().replace(/[:.]/g, '-')}`);
if (fs.existsSync(destination)) throw new Error(`Output already exists: ${destination}. Choose a fresh directory.`);

const readBuffer = (filename: string) => {
  const bytes = fs.readFileSync(filename);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sourceObjects = readBuffer(path.join(source, 'emperia.eobj'));
const sourceSprites = readBuffer(path.join(source, 'emperia.espr'));
const objects = parseObjectData(sourceObjects);
const sprites = parseSpriteData(await maybeDecompress(sourceSprites));
const overrides = new Map<number, ImageData>();
const replacementsByPlan = new Map<string, number>();
const dirty = new Set<number>();
const appearances: object[] = [];
const skipped: object[] = [];
const pendingMerge: object[] = [];
const regionCounts: Record<string, number> = {};
let preservedMaterialAppearances = 0;
let emptyMasks = 0;

for (const thing of objects.things.values()) {
  if (thing.materialMaskLayer != null) { preservedMaterialAppearances++; continue; }
  if (!['item', 'outfit', 'equipment', 'hair'].includes(thing.category) || getColorMaskLayer(thing) == null) continue;
  const ids = collectMaterialMaskSpriteIds(thing.frameGroups, 1);
  const used = new Set<ColorMaskChannel>();
  const invalid: object[] = [];
  let missingSprite = false;
  let hasMaterialPixels = false;
  for (const id of ids) {
    const mask = decodeSprite(sprites, id);
    if (!mask) { missingSprite = true; invalid.push({ spriteId: id, reason: 'missing sprite' }); continue; }
    for (let offset = 0; offset < mask.data.length; offset += 4) {
      if (!mask.data[offset + 3]) continue;
      const rgb = (mask.data[offset] << 16) | (mask.data[offset + 1] << 8) | mask.data[offset + 2];
      if (Object.values(MATERIAL_MASK_COLORS).includes(rgb)) hasMaterialPixels = true;
    }
    const inspection = inspectColorMask(mask);
    inspection.channels.forEach(channel => used.add(channel));
    if (inspection.invalidPixels) invalid.push({ spriteId: id, invalidPixels: inspection.invalidPixels, samples: inspection.invalidColors });
  }
  // A second layer is not proof that its pixels form a color mask.
  if (missingSprite || hasMaterialPixels || (invalid.length && thing.category === 'item' && !thing.colorMaskSources)) { skipped.push({ appearanceId: thing.id, category: thing.category, invalid }); continue; }
  if (!used.size) { emptyMasks++; continue; }
  const previousSources = thing.colorMaskSources ?? [0, 1, 2, 3];
  // Recover the ORIGINAL colour meaning, including previously compacted masks.
  // Red stays secondary; yellow, green and blue all become primary.
  const mapping: Partial<Record<ColorMaskChannel, ColorMaskChannel>> = {};
  const legacyUsed = [...used].map(channel => previousSources[COLOR_MASK_CHANNEL_ORDER.indexOf(channel)]);
  for (const channel of used) {
    mapping[channel] = previousSources[COLOR_MASK_CHANNEL_ORDER.indexOf(channel)] === 1 ? 'body' : 'head';
  }
  const primarySource = [0, 2, 3].find(index => legacyUsed.includes(index)) ?? 0;
  thing.colorMaskSources = legacyUsed.includes(1) ? [primarySource, 1] : [primarySource];
  const regionCount = new Set(Object.values(mapping)).size;
  const changed = Object.entries(mapping).some(([from, to]) => from !== to)
    || JSON.stringify(previousSources) !== JSON.stringify(thing.colorMaskSources);
  regionCounts[regionCount] = (regionCounts[regionCount] ?? 0) + 1;
  const replacements = new Map<number, number>();
  if (changed) {
    for (const id of ids) {
      const original = decodeSprite(sprites, id)!;
      const migrated = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height);
      remapColorMaskPixels(migrated, mapping);
      const inspection = inspectColorMask(migrated);
      assert.ok(!inspection.channels.has('legs') && !inspection.channels.has('feet'), `Appearance ${thing.id}: legacy regions remain`);
      for (let offset = 0; offset < original.data.length; offset += 4) {
        assert.equal(migrated.data[offset + 3], original.data[offset + 3], 'Alpha must survive');
      }
      // Copy every referenced mask for a changed palette plan, even when an
      // individual tile uses only unchanged channels. This isolates its metadata.
      const key = `${id}:${JSON.stringify(mapping)}:${JSON.stringify(thing.colorMaskSources)}`;
      let replacement = replacementsByPlan.get(key);
      if (replacement == null) {
        replacement = ++sprites.spriteCount;
        replacementsByPlan.set(key, replacement);
        overrides.set(replacement, migrated);
      }
      replacements.set(id, replacement);
    }
    // Never alter original IDs: they may also be used by base sprites or materials.
    remapMaterialMaskSpriteIds(thing.frameGroups, 1, replacements);
    thing.rawBytes = undefined;
    dirty.add(thing.id);
  }
  appearances.push({
    appearanceId: thing.id, category: thing.category, regionCount, changed,
    oldToNewChannel: mapping,
    legacyColorSourceByRegion: thing.colorMaskSources.map(index => COLOR_MASK_CHANNEL_ORDER[index]),
    spriteReplacements: Object.fromEntries(replacements),
  });
}

const objectBytes = new Uint8Array(compileObjectData(objects, dirty));
const spriteBytes = new Uint8Array(compileSpriteData(sprites, overrides));
const reloaded = parseObjectData(objectBytes.buffer);
const reloadedSprites = parseSpriteData(spriteBytes.buffer);
for (const [id, image] of overrides) {
  assert.deepEqual(decodeSprite(reloadedSprites, id)?.data, image.data, `Sprite ${id} failed round-trip`);
}
for (const thing of objects.things.values()) {
  assert.ok(!thing.colorMaskSources || thing.colorMaskSources.length <= 2, `Appearance ${thing.id}: more than two regions`);
  assert.deepEqual(reloaded.things.get(thing.id)?.colorMaskSources, thing.colorMaskSources, `Appearance ${thing.id}: lost region mapping`);
  assert.deepEqual(reloaded.things.get(thing.id)?.frameGroups, thing.frameGroups, `Appearance ${thing.id} failed round-trip`);
}

const report = {
  schemaVersion: 1,
  status: 'two-color-migration-complete',
  mergePolicy: 'legacy-green-blue-to-yellow-red-stays-red',
  source,
  sourceHashes: { objects: hash(new Uint8Array(sourceObjects)), sprites: hash(new Uint8Array(sourceSprites)) },
  regionOrder: ['primary', 'secondary'],
  regionRGB: ['FFFF00', 'FF0000'],
  legacyChannels: { head: 'yellow', body: 'red', legs: 'green', feet: 'blue' },
  paletteMigrationRule: 'Resolve the legacy per-piece palette including client slot fallbacks before applying oldToNewChannel. Do not apply this migration twice.',
  summary: { inspectedColorAppearances: appearances.length, changedAppearances: dirty.size, newMaskSprites: overrides.size, preservedMaterialAppearances, emptyMasks, skippedAppearances: skipped.length, pendingMergeAppearances: pendingMerge.length, regionCounts },
  appearances, skipped, pendingMerge,
};
fs.mkdirSync(destination, { recursive: true });
const sourceManifest = JSON.parse(fs.readFileSync(path.join(source, 'asset-package.json'), 'utf8'));
for (const name of Object.keys(sourceManifest.files)) {
  if (name !== path.basename(name)) throw new Error(`Invalid manifest filename: ${name}`);
  if (name === 'emperia.eobj' || name === 'emperia.espr') continue;
  fs.copyFileSync(path.join(source, name), path.join(destination, name));
}
fs.writeFileSync(path.join(destination, 'emperia.eobj'), objectBytes);
fs.writeFileSync(path.join(destination, 'emperia.espr'), new Uint8Array(await gzipCompress(spriteBytes.buffer)));
fs.writeFileSync(path.join(destination, 'two-color-mask-migration.json'), JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(path.join(destination, 'MIGRATION-NOTES.txt'), 'EOBJ v17 — deploy with the matching client, server and data editor.\nThe embedded colorMaskSources table maps normalized regions to saved legacy palette values after fallback resolution. Do not rewrite saved colors: doing so would apply the migration twice. All recognized colour masks use yellow Primary and red Secondary. Legacy green/blue regions merge into Primary; yellow wins its saved palette value when present, otherwise green then blue.\nUnrecognized layers are preserved and listed in two-color-mask-migration.json. Original sprite IDs are retained to protect shared references.\n');
const files = Object.fromEntries(Object.keys(sourceManifest.files).sort().map(name => {
  const bytes = fs.readFileSync(path.join(destination, name));
  return [name, { sha256: hash(bytes), size: bytes.byteLength }];
}));
const identity = Object.entries(files).map(([name, file]) => `${name}:${file.sha256}:${file.size}`).join('\n');
fs.writeFileSync(path.join(destination, 'asset-package.json'), JSON.stringify({ ...sourceManifest, generatedAt: new Date().toISOString(), packageId: createHash('sha256').update(identity).digest('hex'), files }, null, 2) + '\n');
console.log(JSON.stringify({ destination, ...report.summary }, null, 2));
