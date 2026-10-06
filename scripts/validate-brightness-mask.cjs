const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  module._compile(compiled.outputText, filename);
};
const { fillMaterialMaskFromBrightness, paintMaterialMaskStroke } = require('../src/lib/material-mask.ts');
const image = (pixels) => ({ width: pixels.length / 4, height: 1, data: new Uint8ClampedArray(pixels) });
const primary = 0xFFFF00;
const base = image([
  0, 0, 0, 255, 127, 127, 127, 255, 128, 128, 128, 255,
  255, 255, 255, 255, 255, 255, 255, 0, 200, 200, 200, 64,
]);
const original = new Uint8ClampedArray(base.data);
const mask = image(new Array(base.data.length).fill(0));
const alphas = (target) => Array.from(target.data).filter((_, index) => index % 4 === 3);
fillMaterialMaskFromBrightness(base, mask, primary, 128, 255);
assert.deepEqual(alphas(mask), [0, 0, 255, 255, 0, 255]);
assert.deepEqual(Array.from(mask.data.slice(8, 12)), [255, 255, 0, 255]);
// Reapplying a stricter threshold removes the old selected region.
fillMaterialMaskFromBrightness(base, mask, primary, 255, 255);
assert.deepEqual(alphas(mask), [0, 0, 0, 255, 0, 0]);
// Other painted regions outside the threshold remain intact.
mask.data.set([255, 0, 0, 255], 8);
fillMaterialMaskFromBrightness(base, mask, primary, 0, 127);
assert.deepEqual(alphas(mask), [255, 255, 255, 0, 0, 0]);
assert.deepEqual(Array.from(mask.data.slice(8, 12)), [255, 0, 0, 255]);
// Matching pixels overwrite the other region, using the base rather than mask brightness.
fillMaterialMaskFromBrightness(base, mask, primary, 128, 255);
assert.deepEqual(Array.from(mask.data.slice(8, 12)), [255, 255, 0, 255]);
assert.deepEqual(alphas(mask), [0, 0, 255, 255, 0, 255]);
const secondary = 0xFF0000;
fillMaterialMaskFromBrightness(base, mask, secondary, 0, 200);
assert.deepEqual(Array.from(mask.data.slice(8, 12)), [255, 0, 0, 255]);
assert.deepEqual(Array.from(mask.data.slice(20, 24)), [255, 0, 0, 255]);
// Narrowing the secondary selection clears its previous coverage.
fillMaterialMaskFromBrightness(base, mask, secondary, 0, 127);
assert.deepEqual(alphas(mask), [255, 255, 0, 255, 0, 0]);
assert.deepEqual(Array.from(mask.data.slice(12, 16)), [255, 255, 0, 255]);
assert.deepEqual(base.data, original);
// Inclusive bounds select midtones, endpoints, and single brightness values.
for (const [min, max, expected] of [
  [128, 200, [0, 0, 255, 0, 0, 255]],
  [128, 128, [0, 0, 255, 0, 0, 0]],
  [0, 0, [255, 0, 0, 0, 0, 0]],
  [255, 255, [0, 0, 0, 255, 0, 0]],
  [0, 255, [255, 255, 255, 255, 0, 255]],
]) {
  const result = image(new Array(base.data.length).fill(0));
  fillMaterialMaskFromBrightness(base, result, primary, min, max);
  assert.deepEqual(alphas(result), expected);
}
// Reapplying a narrower range removes pixels on both sides.
const narrowed = image(new Array(base.data.length).fill(0));
fillMaterialMaskFromBrightness(base, narrowed, primary, 0, 255);
fillMaterialMaskFromBrightness(base, narrowed, primary, 128, 200);
assert.deepEqual(alphas(narrowed), [0, 0, 255, 0, 0, 255]);
// Perceived brightness distinguishes green from equally saturated red and blue.
const colors = image([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
const colorMask = image(new Array(12).fill(0));
fillMaterialMaskFromBrightness(colors, colorMask, primary, 128, 255);
assert.deepEqual(alphas(colorMask), [0, 255, 0]);
console.log('Brightness mask checks passed.');

// Interpolated strokes and large brushes are clipped per pixel to base alpha.
const brushBase = { width: 4, height: 4, data: new Uint8ClampedArray(64) };
brushBase.data.set([0, 0, 0, 255], (1 * 4 + 1) * 4);
brushBase.data.set([200, 200, 200, 64], (2 * 4 + 2) * 4);
const brushMask = { width: 4, height: 4, data: new Uint8ClampedArray(64) };
paintMaterialMaskStroke(brushMask, { x: 0, y: 0 }, { x: 3, y: 3 }, 3, false, primary, brushBase);
for (let offset = 3; offset < brushMask.data.length; offset += 4) {
  assert.equal(brushMask.data[offset], brushBase.data[offset] ? 255 : 0);
}
const emptyMask = { width: 4, height: 4, data: new Uint8ClampedArray(64) };
paintMaterialMaskStroke(emptyMask, { x: 0, y: 0 }, { x: 3, y: 3 }, 8, false, primary, null);
assert.ok(emptyMask.data.every(value => value === 0));
// Erasing can clean up old paint outside the base (even a missing base tile).
brushMask.data.set([255, 255, 0, 255], 0);
paintMaterialMaskStroke(brushMask, { x: 0, y: 0 }, { x: 0, y: 0 }, 1, true, primary, null);
assert.deepEqual(Array.from(brushMask.data.slice(0, 4)), [0, 0, 0, 0]);
console.log('Base-clipped brush checks passed.');

