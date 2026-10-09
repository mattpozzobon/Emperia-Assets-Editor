const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
global.document = { createElement: () => ({ getContext: () => ({}) }) };
global.ImageData = class ImageData {
  constructor(data, width, height) {
    if (typeof data === 'number') {
      this.width = data; this.height = width; this.data = new Uint8ClampedArray(data * width * 4);
    } else {
      this.data = data; this.width = width; this.height = height;
    }
  }
};
const { useOBStore: store } = require('../src/store/store.ts');
const { captureSpriteEdit, recordSpriteEdit } = require('../src/store/edit-history.ts');
const { desaturateSprite, fillMaterialMaskFromBrightness, paintMaterialMaskStroke } = require('../src/lib/material-mask.ts');
const image = (pixels) => new ImageData(new Uint8ClampedArray(pixels), pixels.length / 4, 1);
const clone = (source) => new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
const primary = 0xFFFF00;
const base = image([20, 80, 40, 255, 120, 30, 50, 255, 50, 60, 70, 128, 5, 8, 10, 0]);
const mask = image([255, 255, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0, 255, 255, 0, 255]);
const result = clone(base);
desaturateSprite(result, mask, primary);
assert.deepEqual([...result.data], [80, 80, 80, 255, ...base.data.slice(4)]);
const emptySelection = clone(base);
desaturateSprite(emptySelection, new ImageData(base.width, base.height), primary);
assert.deepEqual(emptySelection.data, base.data);
const whole = clone(base);
desaturateSprite(whole);
assert.deepEqual([...whole.data], [80,80,80,255,120,120,120,255,70,70,70,128,5,8,10,0]);

const group = { width: 1, height: 1, layers: 2, patternX: 1, patternY: 1, patternZ: 1, animationLength: 1, sprites: [1, 0], animationLengths: [] };
const thing = { id: 1, category: 'outfit', flags: {}, frameGroups: [group], colorMaskSources: [0] };
store.setState({ objectData: { things: new Map([[1, thing]]) }, spriteData: { spriteCount: 1 }, spriteOverrides: new Map([[1, base]]), undoStack: [], redoStack: [], dirtyIds: new Set(), dirtySpriteIds: new Set(), dirty: false });
function edit(action) {
  const before = captureSpriteEdit(store.getState(), 1);
  action();
  store.setState(recordSpriteEdit(before, store.getState()));
}
edit(() => store.getState().replaceSprite(1, result));
store.getState().undo();
assert.deepEqual(store.getState().spriteOverrides.get(1).data, base.data);
store.getState().redo();
assert.deepEqual(store.getState().spriteOverrides.get(1).data, result.data);
// Generate a mask into an empty slot; undo must restore both pixels and slot IDs.
let maskId;
edit(() => {
  const generated = new ImageData(base.width, base.height);
  fillMaterialMaskFromBrightness(base, generated, primary, 0, 255);
  maskId = store.getState().addSprite(generated);
  store.getState().objectData.things.get(1).frameGroups[0].sprites[1] = maskId;
});
store.getState().undo();
assert.equal(store.getState().objectData.things.get(1).frameGroups[0].sprites[1], 0);
assert.equal(store.getState().spriteOverrides.has(maskId), false);
store.getState().redo();
assert.equal(store.getState().objectData.things.get(1).frameGroups[0].sprites[1], maskId);
assert.equal(store.getState().spriteOverrides.has(maskId), true);
// A multi-move erase gesture records one action and restores all original pixels.
const beforeStroke = captureSpriteEdit(store.getState(), 1);
const originalMask = clone(store.getState().spriteOverrides.get(maskId));
const stackSize = store.getState().undoStack.length;
for (const x of [0, 1]) {
  const painted = clone(store.getState().spriteOverrides.get(maskId));
  paintMaterialMaskStroke(painted, { x, y: 0 }, { x, y: 0 }, 1, true, primary, base);
  store.getState().replaceSprite(maskId, painted);
  store.setState(recordSpriteEdit(beforeStroke, store.getState()));
}
assert.equal(store.getState().undoStack.length, stackSize + 1);
store.getState().undo();
assert.deepEqual(store.getState().spriteOverrides.get(maskId).data, originalMask.data);
store.getState().redo();
assert.equal(store.getState().spriteOverrides.get(maskId).data[3], 0);
assert.equal(store.getState().spriteOverrides.get(maskId).data[7], 0);
// Mix property edits and pixels: chronological undo/redo works for both entry types.
store.getState().updateThingFlags(1, { ground: true });
store.getState().undo();
assert.equal(store.getState().objectData.things.get(1).flags.ground, undefined);
store.getState().undo();
assert.deepEqual(store.getState().spriteOverrides.get(maskId).data, originalMask.data);
store.getState().redo();
store.getState().redo();
assert.equal(store.getState().objectData.things.get(1).flags.ground, true);
store.getState().undo();
edit(() => store.getState().replaceSprite(1, whole));
assert.equal(store.getState().redoStack.length, 0);
// No-op actions keep history unchanged, including an available redo.
store.getState().undo();
const undoCount = store.getState().undoStack.length;
const redoCount = store.getState().redoStack.length;
edit(() => {});
assert.equal(store.getState().undoStack.length, undoCount);
assert.equal(store.getState().redoStack.length, redoCount);
assert.equal(store.getState().dirty, true);
assert.equal(store.getState().dirtyIds.has(1), true);
console.log('Mask history and selective desaturation passed.');
