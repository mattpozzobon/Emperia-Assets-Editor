const assert = require('node:assert/strict');
require('../../Emperia-Client/scripts/test-support/register-client-typescript.cjs');

class TestImageData {
  constructor(data, width, height) { Object.assign(this, { data, width, height }); }
}
class TestImage {
  static sourceHeight = 384;
  width = 256;
  height = TestImage.sourceHeight;
  set src(value) { queueMicrotask(() => this.onload()); }
}
const canvases = [];
const downloads = [];
global.ImageData = TestImageData;
global.Image = TestImage;
global.document = {
  body: { appendChild() {}, removeChild() {} },
  createElement(tag) {
    if (tag === 'a') return { click() { downloads.push(this.download); } };
    const canvas = { width: 0, height: 0, placements: [],
      toBlob(callback) { callback(new Blob(['png'])); },
      getContext() {
        let sourceX = 0, sourceY = 0;
        return {
          clearRect() {},
          drawImage(image, x, y) { sourceX = x; sourceY = y; },
          getImageData() {
            const data = new Uint8ClampedArray(32 * 32 * 4);
            data.set([sourceX / 32, sourceY / 32, 0, 255]);
            return new TestImageData(data, 32, 32);
          },
          putImageData(pixels, x, y) { canvas.placements.push({ pixels, x, y }); },
        };
      },
    };
    canvases.push(canvas);
    return canvas;
  },
};
URL.createObjectURL = () => 'blob:test';
URL.revokeObjectURL = () => {};
const { importFullDirectionalSheet, supportsFullSheetImport } = require('../src/lib/full-directional-sheet-import.ts');
// OBD compression is unrelated to PNG rendering and is ESM-only in Node.
require.cache[require.resolve('../src/lib/obd.ts')] = { exports: { encodeOBD() { throw new Error('Unexpected OBD export'); } } };
const { exportSelectedSpriteSheets, exportFrameLayers } = require('../src/lib/export-sprites.ts');

const makeThing = () => ({ id: 100, category: 'equipment', frameGroups: [{
  type: 0, width: 1, height: 1, layers: 1, patternX: 4, patternY: 1,
  patternZ: 1, animationLength: 1, animationLengths: [], sprites: [],
}] });

async function main() {
  const thing = makeThing();
  const overrides = new Map();
  const options = {
    file: {}, thing,
    addSprite(pixels) { const id = overrides.size + 1; overrides.set(id, pixels); return id; },
    idleFrames: 1, movingFrames: 2, layers: 2, spriteSize: 64,
    sourceColumns: [2, 0, 3, 1],
    idleSourceRowsByLayer: [[1], [0]],
    movingSourceRowsByLayer: [[4, 2], [5, 3]],
  };
  assert.deepEqual(await importFullDirectionalSheet(options), { idleFrames: 1, movingFrames: 2, layers: 2 });
  assert.equal(overrides.size, 96);
  for (const [groupIndex, group] of thing.frameGroups.entries()) {
    const sourceRows = groupIndex === 0 ? options.idleSourceRowsByLayer : options.movingSourceRowsByLayer;
    for (let frame = 0; frame < group.animationLength; frame++) {
      for (let direction = 0; direction < 4; direction++) {
        for (let layer = 0; layer < 2; layer++) {
          for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
            const index = (((frame * 4 + direction) * 2 + layer) * 2 + ty) * 2 + tx;
            const pixels = overrides.get(group.sprites[index]);
            assert.deepEqual([...pixels.data.slice(0, 4)], [
              options.sourceColumns[direction] * 2 + 1 - tx,
              sourceRows[layer][frame] * 2 + 1 - ty, 0, 255,
            ]);
          }
        }
      }
    }
  }
  assert.equal(supportsFullSheetImport('attachments'), true);
  assert.equal(supportsFullSheetImport('item'), false);
  for (const layers of [1, 2]) {
    // Match the reported 256x192 attachment sheet, and a sheet with two layers.
    TestImage.sourceHeight = layers * 192;
    const attachment = { ...makeThing(), category: 'attachments' };
    const pixels = new Map();
    const idleRows = layers === 1 ? [[0]] : options.idleSourceRowsByLayer;
    const movingRows = layers === 1 ? [[1, 2]] : options.movingSourceRowsByLayer;
    const result = await importFullDirectionalSheet({ ...options, thing: attachment, layers,
      idleSourceRowsByLayer: idleRows, movingSourceRowsByLayer: movingRows,
      addSprite(data) { const id = pixels.size + 1; pixels.set(id, data); return id; },
    });
    assert.deepEqual(result, { idleFrames: 1, movingFrames: 2, layers });
    assert.equal(attachment.category, 'attachments');
    assert.equal(pixels.size, 48 * layers);
    for (const [groupIndex, group] of attachment.frameGroups.entries()) {
      assert.deepEqual([group.width, group.height, group.patternX, group.layers], [2, 2, 4, layers]);
      const rows = groupIndex === 0 ? idleRows : movingRows;
      for (let frame = 0; frame < group.animationLength; frame++) {
        for (let direction = 0; direction < 4; direction++) {
          for (let layer = 0; layer < layers; layer++) {
            const index = ((frame * 4 + direction) * layers + layer) * 4;
            assert.deepEqual([...pixels.get(group.sprites[index]).data.slice(0, 2)], [
              options.sourceColumns[direction] * 2 + 1, rows[layer][frame] * 2 + 1,
            ]);
          }
        }
      }
    }
  }
  TestImage.sourceHeight = 384;

  const small = makeThing();
  const smallSprites = [];
  await importFullDirectionalSheet({ ...options, thing: small, spriteSize: 32,
    addSprite(pixels) { smallSprites.push(pixels); return smallSprites.length; },
  });
  assert.equal(small.frameGroups[0].width, 1);
  assert.equal(small.frameGroups[0].height, 1);
  assert.equal(smallSprites.length, 24);

  const invalid = makeThing();
  const before = JSON.stringify(invalid);
  await assert.rejects(importFullDirectionalSheet({ ...options, thing: invalid,
    movingSourceRowsByLayer: [[1, 2], [5, 3]],
  }), /one frame and layer/);
  assert.equal(JSON.stringify(invalid), before);
  await assert.rejects(importFullDirectionalSheet({ ...options, thing: invalid,
    idleSourceRowsByLayer: [[1]],
  }), /incomplete/);
  await assert.rejects(importFullDirectionalSheet({ ...options, thing: invalid,
    sourceColumns: [0, 0, 2, 3],
  }), /duplicate/);

  const ctx = { objectData: { itemCount: 100, things: new Map([[100, thing]]) },
    spriteData: {}, spriteOverrides: overrides, itemDefinitions: new Map(), appearanceToItemIds: new Map() };
  await exportSelectedSpriteSheets([100], ctx);
  let sheet = canvases.at(-1);
  assert.deepEqual([sheet.width, sheet.height], [256, 384]);
  assert.equal(sheet.placements.length, 96);
  // Each exported row has the mapped source layer, frame and direction, in visual tile order.
  for (const placement of sheet.placements) {
    const row = Math.floor(placement.y / 64);
    const column = Math.floor(placement.x / 64);
    const sourceRow = [1, 0, 4, 5, 2, 3][row];
    assert.deepEqual([...placement.pixels.data.slice(0, 2)], [
      options.sourceColumns[column] * 2 + (placement.x % 64) / 32,
      sourceRow * 2 + (placement.y % 64) / 32,
    ]);
  }
  await exportSelectedSpriteSheets([100], ctx, 1);
  sheet = canvases.at(-1);
  assert.deepEqual([sheet.width, sheet.height], [256, 192]);
  assert.equal(sheet.placements.length, 48);
  assert.ok(sheet.placements.every(({ pixels }) => [0, 5, 3].includes(Math.floor(pixels.data[1] / 2))));
  assert.match(downloads.at(-1), /layer2_sheet\.png$/);

  await exportFrameLayers(thing, thing.frameGroups[1], 1, {}, overrides, null, [0, 1, 2, 3], [0], 0);
  let png = canvases.at(-1);
  assert.deepEqual([png.width, png.height], [256, 128]);
  assert.equal(png.placements.length, 32);
  await exportFrameLayers(thing, thing.frameGroups[1], 1, {}, overrides, 1, [2], [0], 0);
  png = canvases.at(-1);
  assert.deepEqual([png.width, png.height], [64, 64]);
  assert.equal(png.placements.length, 4);
  assert.ok(png.placements.every(({ pixels }) => Math.floor(pixels.data[0] / 2) === 3 && Math.floor(pixels.data[1] / 2) === 3));
  assert.match(downloads.at(-1), /layer2\.png$/);
  console.log('Verified one/two-layer Attachment imports, two-layer row import, direction remapping, 64px tile orientation, invalid mappings, and all/single-layer PNG and sheet exports.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
