const assert = require('node:assert/strict');
require('../../Emperia-Client/scripts/test-support/register-client-typescript.cjs');
const { importFullDirectionalSheet } = require('../src/lib/full-directional-sheet-import.ts');

class TestImageData {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}
class TestImage {
  width = 256;
  height = 192;
  set src(_value) { queueMicrotask(() => this.onload?.()); }
}

global.ImageData = TestImageData;
global.Image = TestImage;
global.document = {
  createElement: () => ({
    getContext: () => ({
      clearRect() {},
      drawImage() {},
      getImageData() {
        const pixels = new Uint8ClampedArray(32 * 32 * 4);
        pixels.set([128, 128, 128, 255], 0);
        return new TestImageData(pixels, 32, 32);
      },
    }),
  }),
};
URL.createObjectURL = () => 'blob:test';
URL.revokeObjectURL = () => {};

const thing = { category: 'beard', frameGroups: [{
  type: 0, width: 1, height: 1, layers: 1, patternX: 4, patternY: 1,
  patternZ: 1, animationLength: 1, animationLengths: [], sprites: [],
}] };
const sprites = [];

void importFullDirectionalSheet({
  file: {}, thing,
  addSprite(data) { sprites.push(data); return sprites.length; },
  idleFrames: 1, movingFrames: 2, layers: 1, spriteSize: 64,
  sourceColumnsByLayer: [[0, 1, 2, 3]],
  idleSourceRows: [0], movingSourceRows: [1, 2],
}).then((result) => {
  assert.deepEqual(result, { idleFrames: 1, movingFrames: 2, layers: 2 });
  assert.equal(thing.frameGroups[0].layers, 2);
  assert.equal(thing.frameGroups[1].layers, 2);
  assert.deepEqual(thing.colorMaskSources, [0]);
  assert.equal(sprites.length, 4 * 3 * 4 * 2);
  const mask = sprites[1].data;
  assert.deepEqual([...mask.slice(0, 4)], [255, 255, 0, 255]);
  assert.deepEqual([...mask.slice(4, 8)], [0, 0, 0, 0]);
  console.log('Verified 64px Beard sheet import creates four directions, animation frames, and hair-colour masks.');
}).catch((error) => { console.error(error); process.exitCode = 1; });
