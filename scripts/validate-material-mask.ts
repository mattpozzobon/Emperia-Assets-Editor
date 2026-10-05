import { applyOutfitMask, COLOR_MASK_COLORS, getColorMaskLayer, OUTFIT_PALETTE } from '../src/lib/outfit-colors';
import { resizeFrameGroupLayers } from '../src/lib/frame-group-layout';
import fs from 'node:fs';
import { compileObjectData } from '../src/lib/object-writer';
import { parseObjectData } from '../src/lib/object-parser';
import { applyMaterialMask, collectMaterialBaseSpriteIds, desaturateSprite, fillMaterialMaskFromNonBlackPixels, findSharedMaterialMaskSpriteIds, paintMaterialMaskStroke, remapMaterialMaskSpriteIds } from '../src/lib/material-mask';

const sourceFilename = 'C:/Dev/Emperia-Assets/current/emperia.eobj';
const source = fs.readFileSync(sourceFilename);
const parsed = parseObjectData(
  source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
);

const appearanceId = 125;
const thing = parsed.things.get(appearanceId);
if (!thing || thing.category !== 'item' || thing.frameGroups.some((group) => group.layers < 2)) {
  throw new Error(`Expected layered item appearance ${appearanceId} in ${sourceFilename}`);
}

thing.materialMaskLayer = 1;
const roundTrip = parseObjectData(compileObjectData(parsed));
if (roundTrip.formatVersion !== 16) {
  throw new Error(`Expected EOBJ v16, received v${roundTrip.formatVersion}`);
}
if (roundTrip.things.get(appearanceId)?.materialMaskLayer !== 1) {
  throw new Error('Material mask layer did not survive the EOBJ round-trip');
}
if (roundTrip.itemAppearances.size !== parsed.itemAppearances.size) {
  throw new Error('Material mask round-trip changed the public item mapping');
}

const base = { data: new Uint8ClampedArray([200, 100, 50, 255, 10, 20, 30, 255]) } as ImageData;
const mask = { data: new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 0]) } as ImageData;
applyMaterialMask(base, mask, 0x804020);
if (base.data[0] !== 100 || base.data[1] !== 25 || base.data[2] !== 6) {
  throw new Error(`Material mask color composition produced ${base.data.slice(0, 3).join(',')}`);
}
if (base.data[4] !== 10 || base.data[5] !== 20 || base.data[6] !== 30) {
  throw new Error('Transparent material mask pixels changed the base sprite');
}

const painted = { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 4) } as ImageData;
paintMaterialMaskStroke(painted, { x: 0, y: 0 }, { x: 3, y: 3 }, 1, false, 0xFF9A3D);
for (let coordinate = 0; coordinate < 4; coordinate++) {
  if (painted.data[(coordinate * 4 + coordinate) * 4 + 3] !== 0xFF) {
    throw new Error('Material mask brush did not interpolate the full stroke');
  }
}
if (painted.data[0] !== 0xFF || painted.data[1] !== 0x9A || painted.data[2] !== 0x3D) {
  throw new Error('Material mask brush did not preserve the semantic material color');
}
paintMaterialMaskStroke(painted, { x: 1, y: 1 }, { x: 1, y: 1 }, 1, true);
if (painted.data[(1 * 4 + 1) * 4 + 3] !== 0) {
  throw new Error('Material mask eraser did not clear the painted pixel');
}

const colored = {
  width: 3,
  height: 1,
  data: new Uint8ClampedArray([
    40, 120, 80, 255,
    90, 10, 30, 0,
    0, 0, 0, 255,
  ]),
} as ImageData;
desaturateSprite(colored);
if (colored.data[0] !== 120 || colored.data[1] !== 120 || colored.data[2] !== 120) {
  throw new Error('HSV saturation zero did not preserve the pixel value');
}
if (colored.data[4] !== 90 || colored.data[5] !== 10 || colored.data[6] !== 30) {
  throw new Error('Desaturation changed a fully transparent pixel');
}
if (colored.data[8] !== 0 || colored.data[9] !== 0 || colored.data[10] !== 0) {
  throw new Error('Desaturation changed a pure-black pixel');
}

const generatedMask = {
  width: 3,
  height: 1,
  data: new Uint8ClampedArray(3 * 4),
} as ImageData;
fillMaterialMaskFromNonBlackPixels(colored, generatedMask, 0xD85CFF);
if (generatedMask.data[0] !== 0xD8 || generatedMask.data[1] !== 0x5C || generatedMask.data[2] !== 0xFF || generatedMask.data[3] !== 0xFF) {
  throw new Error('Non-black pixel did not receive the selected material color');
}
if (generatedMask.data[7] !== 0 || generatedMask.data[11] !== 0) {
  throw new Error('Transparent or pure-black pixels were included in the generated material mask');
}

const paintedMetal = {
  width: 2,
  height: 1,
  data: new Uint8ClampedArray([
    20, 30, 40, 255,
    50, 60, 70, 255,
  ]),
} as ImageData;
const mixedMask = {
  width: 2,
  height: 1,
  data: new Uint8ClampedArray([
    0x4D, 0xA3, 0xFF, 0xFF,
    0, 0, 0, 0,
  ]),
} as ImageData;
fillMaterialMaskFromNonBlackPixels(paintedMetal, mixedMask, 0xFF9A3D);
if (mixedMask.data[0] !== 0x4D || mixedMask.data[1] !== 0xA3 || mixedMask.data[2] !== 0xFF) {
  throw new Error('Automatic Leather fill overwrote an existing Metal pixel');
}
if (mixedMask.data[4] !== 0xFF || mixedMask.data[5] !== 0x9A || mixedMask.data[6] !== 0x3D || mixedMask.data[7] !== 0xFF) {
  throw new Error('Automatic Leather fill did not assign an unpainted pixel');
}

const baseSpriteIds = collectMaterialBaseSpriteIds([{
  type: 0,
  width: 1,
  height: 1,
  layers: 2,
  patternX: 1,
  patternY: 1,
  patternZ: 1,
  animationLength: 2,
  asynchronous: 0,
  nLoop: 0,
  start: 0,
  animationLengths: [{ min: 100, max: 100 }, { min: 100, max: 100 }],
  sprites: [11, 21, 12, 22],
}], 1);
if (baseSpriteIds.join(',') !== '11,12') {
  throw new Error(`Expected only base-layer sprites, received ${baseSpriteIds.join(',')}`);
}

const owner = {
  id: 100,
  frameGroups: [
    {
      type: 0, width: 1, height: 1, layers: 2,
      patternX: 1, patternY: 1, patternZ: 1, animationLength: 2,
      asynchronous: 0, nLoop: 0, start: 0,
      animationLengths: [{ min: 100, max: 100 }, { min: 100, max: 100 }],
      sprites: [11, 21, 12, 22],
    },
    {
      type: 1, width: 1, height: 1, layers: 2,
      patternX: 1, patternY: 1, patternZ: 1, animationLength: 1,
      asynchronous: 0, nLoop: 0, start: 0,
      animationLengths: [{ min: 100, max: 100 }],
      sprites: [13, 21],
    },
  ],
} as any;
const other = {
  id: 101,
  frameGroups: [{
    type: 0, width: 1, height: 1, layers: 1,
    patternX: 1, patternY: 1, patternZ: 1, animationLength: 1,
    asynchronous: 0, nLoop: 0, start: 0,
    animationLengths: [{ min: 100, max: 100 }],
    sprites: [21],
  }],
} as any;
const sharedMaskIds = findSharedMaterialMaskSpriteIds([owner, other], owner, owner.frameGroups[0], 1);
if (sharedMaskIds.join(',') !== '21') {
  throw new Error(`Expected shared material mask sprite 21, received ${sharedMaskIds.join(',')}`);
}
const movingSharedMaskIds = findSharedMaterialMaskSpriteIds([owner, other], owner, owner.frameGroups[1], 1);
if (movingSharedMaskIds.join(',') !== '21') {
  throw new Error(`Expected Moving to detect shared material mask sprite 21, received ${movingSharedMaskIds.join(',')}`);
}
remapMaterialMaskSpriteIds([owner.frameGroups[0]], 1, new Map([[21, 31]]));
if (owner.frameGroups[0].sprites.join(',') !== '11,31,12,22') {
  throw new Error(`Material mask remap changed the wrong slots: ${owner.frameGroups[0].sprites.join(',')}`);
}
if (owner.frameGroups[1].sprites.join(',') !== '13,21') {
  throw new Error(`Idle material mask remap leaked into Moving: ${owner.frameGroups[1].sprites.join(',')}`);
}
remapMaterialMaskSpriteIds([owner.frameGroups[1]], 1, new Map([[21, 32]]));
if (owner.frameGroups[1].sprites.join(',') !== '13,32') {
  throw new Error(`Moving material mask did not receive its own sprite ID: ${owner.frameGroups[1].sprites.join(',')}`);
}
if (owner.frameGroups[0].sprites[1] === owner.frameGroups[1].sprites[1]) {
  throw new Error('Idle and Moving material masks still share a sprite ID after remapping both groups');
}

console.log(`Validated EOBJ v16 multi-material mask round-trip for appearance ${appearanceId}.`);

// The legacy checkbox persists through the existing layer layout, without a new catalog.
delete thing.materialMaskLayer;
thing.rawBytes = undefined;
const legacyRoundTrip = parseObjectData(compileObjectData(parsed)).things.get(appearanceId)!;
if (getColorMaskLayer(legacyRoundTrip) !== 1 || legacyRoundTrip.materialMaskLayer != null) {
  throw new Error('Legacy color mask did not survive the EOBJ round-trip');
}
for (const group of thing.frameGroups) resizeFrameGroupLayers(group, 1);
const disabledRoundTrip = parseObjectData(compileObjectData(parsed)).things.get(appearanceId)!;
if (getColorMaskLayer(disabledRoundTrip) != null) throw new Error('Disabled color mask reappeared after saving');

const regions = Object.keys(COLOR_MASK_COLORS) as (keyof typeof COLOR_MASK_COLORS)[];
for (const region of regions) {
  const legacyMask = { width: 1, height: 1, data: new Uint8ClampedArray(4) } as ImageData;
  const whiteBase = { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) } as ImageData;
  paintMaterialMaskStroke(legacyMask, { x: 0, y: 0 }, { x: 0, y: 0 }, 1, false, COLOR_MASK_COLORS[region]);
  const colors = { primary: 0, secondary: 0, [region]: 80 };
  applyOutfitMask(whiteBase, legacyMask, colors);
  const tint = OUTFIT_PALETTE[80];
  if (whiteBase.data[0] !== (tint & 255) || whiteBase.data[1] !== ((tint >>> 8) & 255) || whiteBase.data[2] !== ((tint >>> 16) & 255)) {
    throw new Error(`Painted ${region} mask did not recolor its region`);
  }
  paintMaterialMaskStroke(legacyMask, { x: 0, y: 0 }, { x: 0, y: 0 }, 1, true);
  if (legacyMask.data[3] !== 0) throw new Error(`Could not erase ${region} mask`);
  fillMaterialMaskFromNonBlackPixels(whiteBase, legacyMask, COLOR_MASK_COLORS[region]);
  if (legacyMask.data[3] !== 255) throw new Error(`Could not fill ${region} mask`);
}
console.log('Validated legacy color-mask persistence, two paint channels, erasing, and filling.');
