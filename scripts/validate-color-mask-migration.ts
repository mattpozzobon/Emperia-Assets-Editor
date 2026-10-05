import assert from 'node:assert/strict';
import { applyOutfitMask, COLOR_MASK_COLORS } from './legacy-outfit-colors';
import { COLOR_MASK_CHANNEL_ORDER, inspectColorMask, planColorMaskMigration, remapColorMaskPalette, remapColorMaskPixels } from './legacy-color-mask-migration';

const colors = { head: 22, body: 58, legs: 81, feet: 102 };
for (let subset = 0; subset < 16; subset++) {
  const used = new Set(COLOR_MASK_CHANNEL_ORDER.filter((_, index) => (subset & (1 << index)) !== 0));
  const mapping = planColorMaskMigration(used);
  assert.equal(new Set(Object.values(mapping)).size, used.size, 'Distinct regions must never merge');
  if (used.has('head')) assert.equal(mapping.head, 'head', 'Yellow must remain primary');
  const bytes = new Uint8ClampedArray(5 * 4);
  let pixel = 0;
  for (const channel of used) {
    const rgb = COLOR_MASK_COLORS[channel];
    bytes.set([rgb >>> 16, (rgb >>> 8) & 255, rgb & 255, 255], pixel++ * 4);
  }
  const original = { data: bytes } as ImageData;
  const migrated = { data: new Uint8ClampedArray(bytes) } as ImageData;
  remapColorMaskPixels(migrated, mapping);
  assert.equal(inspectColorMask(migrated).channels.size, used.size);
  const oldRender = { data: new Uint8ClampedArray(bytes.length).fill(200) } as ImageData;
  const newRender = { data: new Uint8ClampedArray(oldRender.data) } as ImageData;
  applyOutfitMask(oldRender, original, colors);
  applyOutfitMask(newRender, migrated, remapColorMaskPalette(colors, mapping));
  assert.deepEqual(newRender.data, oldRender.data, `Subset ${subset}: visual result changed`);
  const secondPass = { data: new Uint8ClampedArray(migrated.data) } as ImageData;
  remapColorMaskPixels(secondPass, planColorMaskMigration(inspectColorMask(migrated).channels));
  assert.deepEqual(secondPass.data, migrated.data, 'Already normalized masks must be stable');
}
const unknown = { data: new Uint8ClampedArray([1, 2, 3, 255, 0, 0, 255, 128, 255, 255, 0, 0]) } as ImageData;
assert.equal(inspectColorMask(unknown).invalidPixels, 2);
const before = new Uint8ClampedArray(unknown.data);
remapColorMaskPixels(unknown, { feet: 'head' });
assert.deepEqual(unknown.data, before, 'Unknown, partial-alpha and transparent pixels must be preserved');
console.log('Validated all 16 channel combinations, distinct-region preservation, palette migration, transparency, and stable normalized masks.');
