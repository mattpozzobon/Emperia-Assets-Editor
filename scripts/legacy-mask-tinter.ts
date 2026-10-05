const HEAD_MASK = 0xFF00FFFF;
const BODY_MASK = 0xFF0000FF;
const LEGS_MASK = 0xFF00FF00;
const FEET_MASK = 0xFFFF0000;

export function tintOutfitMask(
  base: Uint8ClampedArray,
  maskBytes: Uint8ClampedArray,
  head: number,
  body: number,
  legs: number,
  feet: number,
  equipmentRgb: boolean,
): void {
  const mask = new Uint32Array(
    maskBytes.buffer,
    maskBytes.byteOffset,
    maskBytes.byteLength >>> 2,
  );
  const headRed = equipmentRgb ? (head >>> 16) & 0xFF : head & 0xFF;
  const headGreen = (head >>> 8) & 0xFF;
  const headBlue = equipmentRgb ? head & 0xFF : (head >>> 16) & 0xFF;
  const bodyRed = equipmentRgb ? (body >>> 16) & 0xFF : body & 0xFF;
  const bodyGreen = (body >>> 8) & 0xFF;
  const bodyBlue = equipmentRgb ? body & 0xFF : (body >>> 16) & 0xFF;
  const legsRed = equipmentRgb ? (legs >>> 16) & 0xFF : legs & 0xFF;
  const legsGreen = (legs >>> 8) & 0xFF;
  const legsBlue = equipmentRgb ? legs & 0xFF : (legs >>> 16) & 0xFF;
  const feetRed = equipmentRgb ? (feet >>> 16) & 0xFF : feet & 0xFF;
  const feetGreen = (feet >>> 8) & 0xFF;
  const feetBlue = equipmentRgb ? feet & 0xFF : (feet >>> 16) & 0xFF;

  for (let index = 0; index < mask.length; index++) {
    let red: number;
    let green: number;
    let blue: number;
    switch (mask[index]) {
      case HEAD_MASK:
        red = headRed;
        green = headGreen;
        blue = headBlue;
        break;
      case BODY_MASK:
        red = bodyRed;
        green = bodyGreen;
        blue = bodyBlue;
        break;
      case LEGS_MASK:
        red = legsRed;
        green = legsGreen;
        blue = legsBlue;
        break;
      case FEET_MASK:
        red = feetRed;
        green = feetGreen;
        blue = feetBlue;
        break;
      default:
        continue;
    }
    const offset = index << 2;
    base[offset] = (base[offset] * red) / 0xFF;
    base[offset + 1] = (base[offset + 1] * green) / 0xFF;
    base[offset + 2] = (base[offset + 2] * blue) / 0xFF;
  }
}
