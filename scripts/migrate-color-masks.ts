import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { parseObjectData } from '../src/lib/object-parser';
import { compileObjectData } from '../src/lib/object-writer';
import { compileSpriteData } from '../src/lib/sprite-writer';
import { maybeDecompress, gzipCompress } from '../src/lib/emperia-format';
import { collectMaterialMaskSpriteIds, remapMaterialMaskSpriteIds } from '../src/lib/material-mask';
import { applyOutfitMask, getColorMaskLayer } from './legacy-outfit-colors';
import { COLOR_MASK_CHANNEL_ORDER, inspectColorMask, planColorMaskMigration, remapColorMaskPalette, remapColorMaskPixels } from './legacy-color-mask-migration';
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
const destination = path.resolve(process.argv[3] ?? `../Emperia-Assets/migrations/color-regions-${new Date().toISOString().replace(/[:.]/g, '-')}`);
if (fs.existsSync(destination)) throw new Error(`Output already exists: ${destination}. Choose a fresh directory.`);
if (fs.existsSync(path.join(source, 'color-mask-migration.json'))) throw new Error('This package was already migrated. Use the original source to preserve the legacy palette mapping.');
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
const regionCounts: Record<string, number> = {};
const testColors = { head: 22, body: 58, legs: 81, feet: 102 };
let preservedMaterialAppearances = 0;
let emptyMasks = 0;

for (const thing of objects.things.values()) {
  if (thing.materialMaskLayer != null) { preservedMaterialAppearances++; continue; }
  if (!['item', 'outfit', 'equipment', 'hair'].includes(thing.category) || getColorMaskLayer(thing) == null) continue;
  const ids = collectMaterialMaskSpriteIds(thing.frameGroups, 1);
  const used = new Set<ColorMaskChannel>();
  const invalid: object[] = [];
  for (const id of ids) {
    const mask = decodeSprite(sprites, id);
    if (!mask) { invalid.push({ spriteId: id, reason: 'missing sprite' }); continue; }
    const inspection = inspectColorMask(mask);
    inspection.channels.forEach(channel => used.add(channel));
    if (inspection.invalidPixels) invalid.push({ spriteId: id, invalidPixels: inspection.invalidPixels, samples: inspection.invalidColors });
  }
  // A second layer is not proof that its pixels form a color mask.
  if (invalid.length) { skipped.push({ appearanceId: thing.id, category: thing.category, invalid }); continue; }
  if (!used.size) { emptyMasks++; continue; }
  const mapping = planColorMaskMigration(used);
  thing.colorMaskSources = COLOR_MASK_CHANNEL_ORDER.slice(0, used.size).map(target => COLOR_MASK_CHANNEL_ORDER.indexOf(COLOR_MASK_CHANNEL_ORDER.find(from => mapping[from] === target)!));
  const changed = Object.entries(mapping).some(([from, to]) => from !== to);
  regionCounts[used.size] = (regionCounts[used.size] ?? 0) + 1;
  const replacements = new Map<number, number>();
  if (changed) {
    for (const id of ids) {
      const original = decodeSprite(sprites, id)!;
      const migrated = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height);
      remapColorMaskPixels(migrated, mapping);
      // Compare actual tinted pixels, not only symbolic channel names.
      const oldRender = new ImageData(new Uint8ClampedArray(32 * 32 * 4).fill(255), 32, 32);
      const newRender = new ImageData(new Uint8ClampedArray(oldRender.data), 32, 32);
      applyOutfitMask(oldRender, original, testColors);
      applyOutfitMask(newRender, migrated, remapColorMaskPalette(testColors, mapping));
      assert.deepEqual(newRender.data, oldRender.data, `Appearance ${thing.id}, sprite ${id}: tint changed`);
      // Copy every referenced mask for a changed palette plan, even when an
      // individual tile uses only unchanged channels. This isolates its metadata.
      const key = `${id}:${JSON.stringify(mapping)}`;
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
    appearanceId: thing.id, category: thing.category, regionCount: used.size, changed,
    oldToNewChannel: mapping,
    legacyColorSourceByRegion: COLOR_MASK_CHANNEL_ORDER.slice(0, used.size).map(target => (
      COLOR_MASK_CHANNEL_ORDER.find(from => mapping[from] === target)
    )),
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
  assert.deepEqual(reloaded.things.get(thing.id)?.colorMaskSources, thing.colorMaskSources, `Appearance ${thing.id}: lost region mapping`);
  assert.deepEqual(reloaded.things.get(thing.id)?.frameGroups, thing.frameGroups, `Appearance ${thing.id} failed round-trip`);
}

const report = {
  schemaVersion: 1,
  status: 'eobj-v16-compatible-with-region-aware-client',
  source,
  sourceHashes: { objects: hash(new Uint8Array(sourceObjects)), sprites: hash(new Uint8Array(sourceSprites)) },
  regionOrder: ['primary', 'secondary', 'tertiary', 'quaternary'],
  regionRGB: ['FFFF00', 'FF0000', '00FF00', '0000FF'],
  legacyChannels: { head: 'yellow', body: 'red', legs: 'green', feet: 'blue' },
  paletteMigrationRule: 'Resolve the legacy per-piece palette including client slot fallbacks before applying oldToNewChannel. Do not apply this migration twice.',
  summary: { inspectedColorAppearances: appearances.length, changedAppearances: dirty.size, newMaskSprites: overrides.size, preservedMaterialAppearances, emptyMasks, skippedAppearances: skipped.length, regionCounts },
  appearances, skipped,
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
fs.writeFileSync(path.join(destination, 'color-mask-migration.json'), JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(path.join(destination, 'MIGRATION-NOTES.txt'), 'EOBJ v16 — deploy with the matching client, server and data editor.\nThe embedded colorMaskSources table maps normalized regions to saved legacy palette values after fallback resolution. Do not rewrite saved colors: doing so would apply the migration twice.\nUnrecognized layers are preserved and listed in color-mask-migration.json. Original sprite IDs are retained to protect shared references.\n');
const files = Object.fromEntries(Object.keys(sourceManifest.files).sort().map(name => {
  const bytes = fs.readFileSync(path.join(destination, name));
  return [name, { sha256: hash(bytes), size: bytes.byteLength }];
}));
const identity = Object.entries(files).map(([name, file]) => `${name}:${file.sha256}:${file.size}`).join('\n');
fs.writeFileSync(path.join(destination, 'asset-package.json'), JSON.stringify({ ...sourceManifest, generatedAt: new Date().toISOString(), packageId: createHash('sha256').update(identity).digest('hex'), files }, null, 2) + '\n');
console.log(JSON.stringify({ destination, ...report.summary }, null, 2));
