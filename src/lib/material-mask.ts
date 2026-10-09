/**
 * Applies one RGB material color through an alpha mask while retaining the
 * authored luminance and shading of the base sprite.
 */
import type { FrameGroup, ThingType } from './types';

/**
 * Sets HSV saturation to zero while preserving each pixel's value and alpha.
 * This matches Aseprite's HSV saturation -1 operation: the brightest RGB
 * channel becomes the neutral gray value. An optional mask restricts the
 * operation to visible pixels of the selected region.
 */
export function desaturateSprite(image: ImageData, mask?: ImageData, regionColor?: number): void {
  const bytes = image.data;
  for (let offset = 0; offset < bytes.length; offset += 4) {
    if (bytes[offset + 3] === 0) continue;
    if (mask) {
      if (!mask.data[offset + 3]) continue;
      const rgb = (mask.data[offset] << 16) | (mask.data[offset + 1] << 8) | mask.data[offset + 2];
      if (regionColor != null && rgb !== regionColor) continue;
    }
    const value = Math.max(bytes[offset], bytes[offset + 1], bytes[offset + 2]);
    // Pure black remains pure black; only colored/non-black pixels change.
    if (value === 0) continue;
    bytes[offset] = value;
    bytes[offset + 1] = value;
    bytes[offset + 2] = value;
  }
}

/**
 * Adds `color` to visible, non-black base pixels that do not have a material.
 * Existing painted material pixels are preserved, regardless of their color.
 */
export function fillMaterialMaskFromNonBlackPixels(
  base: ImageData,
  mask: ImageData,
  color: number,
): void {
  const red = (color >>> 16) & 0xFF;
  const green = (color >>> 8) & 0xFF;
  const blue = color & 0xFF;
  const length = Math.min(base.data.length, mask.data.length);

  for (let offset = 0; offset < length; offset += 4) {
    const sourceAlpha = base.data[offset + 3];
    const isBlack = base.data[offset] === 0
      && base.data[offset + 1] === 0
      && base.data[offset + 2] === 0;
    const alreadyHasMaterial = mask.data[offset + 3] !== 0;
    if (sourceAlpha === 0 || isBlack || alreadyHasMaterial) continue;

    mask.data[offset] = red;
    mask.data[offset + 1] = green;
    mask.data[offset + 2] = blue;
    mask.data[offset + 3] = 0xFF;
  }
}

/** Rebuilds one region from base brightness, overwriting any matching mask pixels. */
export function fillMaterialMaskFromBrightness(
  base: ImageData,
  mask: ImageData,
  color: number,
  minimum: number,
  maximum: number,
): void {
  const red = (color >>> 16) & 0xFF;
  const green = (color >>> 8) & 0xFF;
  const blue = color & 0xFF;
  const lower = Math.max(0, Math.min(255, Math.round(minimum)));
  const upper = Math.max(lower, Math.min(255, Math.round(maximum)));
  for (let offset = 0; offset < mask.data.length; offset += 4) {
    const isSelectedRegion = mask.data[offset] === red
      && mask.data[offset + 1] === green && mask.data[offset + 2] === blue;
    // Integer weights keep grayscale values exact at the threshold boundary.
    const brightness = (2126 * base.data[offset] + 7152 * base.data[offset + 1]
      + 722 * base.data[offset + 2]) / 10000;
    const matches = offset < base.data.length && base.data[offset + 3] > 0
      && brightness >= lower && brightness <= upper;
    // Existing colors must not block a new selection. Outside the selection,
    // clear the old active region while keeping unrelated regions intact.
    if (!matches && !isSelectedRegion) continue;
    mask.data[offset] = matches ? red : 0;
    mask.data[offset + 1] = matches ? green : 0;
    mask.data[offset + 2] = matches ? blue : 0;
    mask.data[offset + 3] = matches ? 255 : 0;
  }
}

/**
 * Returns every sprite used by an appearance outside its semantic material
 * mask layer. IDs also used as masks are excluded so their material colors
 * can never be destroyed accidentally.
 */
export function collectMaterialBaseSpriteIds(
  frameGroups: FrameGroup[],
  materialMaskLayer: number,
): number[] {
  const baseIds = new Set<number>();
  const maskIds = new Set<number>();

  for (const group of frameGroups) {
    const tilesPerLayer = group.width * group.height;
    if (tilesPerLayer <= 0 || group.layers <= 0) continue;

    for (let index = 0; index < group.sprites.length; index++) {
      const spriteId = group.sprites[index] ?? 0;
      if (spriteId <= 0) continue;
      const layer = Math.floor(index / tilesPerLayer) % group.layers;
      if (layer === materialMaskLayer) maskIds.add(spriteId);
      else baseIds.add(spriteId);
    }
  }

  return Array.from(baseIds).filter((spriteId) => !maskIds.has(spriteId));
}

export function collectMaterialMaskSpriteIds(
  frameGroups: FrameGroup[],
  materialMaskLayer: number,
): number[] {
  const ids = new Set<number>();
  for (const group of frameGroups) {
    const tilesPerLayer = group.width * group.height;
    if (tilesPerLayer <= 0 || materialMaskLayer >= group.layers) continue;
    const appearanceCount = group.patternX * group.patternY * group.patternZ * group.animationLength;
    for (let appearance = 0; appearance < appearanceCount; appearance++) {
      const start = (appearance * group.layers + materialMaskLayer) * tilesPerLayer;
      for (let tile = 0; tile < tilesPerLayer; tile++) {
        const id = group.sprites[start + tile] ?? 0;
        if (id > 0) ids.add(id);
      }
    }
  }
  return Array.from(ids);
}

/**
 * Returns mask sprite IDs that are also referenced outside the owner's mask
 * slots. A reference from another appearance, or from the owner's base layers,
 * means editing the mask would mutate pixels used somewhere else.
 */
export function findSharedMaterialMaskSpriteIds(
  things: Iterable<ThingType>,
  owner: ThingType,
  ownerFrameGroup: FrameGroup,
  materialMaskLayer: number,
): number[] {
  const candidates = new Set(collectMaterialMaskSpriteIds([ownerFrameGroup], materialMaskLayer));
  if (candidates.size === 0) return [];

  const shared = new Set<number>();
  for (const thing of things) {
    for (const group of thing.frameGroups) {
      const tilesPerLayer = group.width * group.height;
      if (tilesPerLayer <= 0 || group.layers <= 0) continue;
      for (let index = 0; index < group.sprites.length; index++) {
        const spriteId = group.sprites[index] ?? 0;
        if (!candidates.has(spriteId)) continue;
        const layer = Math.floor(index / tilesPerLayer) % group.layers;
        const isOwnerMaskSlot = thing.id === owner.id
          && group === ownerFrameGroup
          && layer === materialMaskLayer;
        if (!isOwnerMaskSlot) shared.add(spriteId);
      }
    }
  }

  return Array.from(shared).sort((left, right) => left - right);
}

/** Remaps only the material-mask slots, leaving base sprite references intact. */
export function remapMaterialMaskSpriteIds(
  frameGroups: FrameGroup[],
  materialMaskLayer: number,
  replacements: ReadonlyMap<number, number>,
): void {
  for (const group of frameGroups) {
    const tilesPerLayer = group.width * group.height;
    if (tilesPerLayer <= 0 || materialMaskLayer >= group.layers) continue;
    for (let index = 0; index < group.sprites.length; index++) {
      const layer = Math.floor(index / tilesPerLayer) % group.layers;
      if (layer !== materialMaskLayer) continue;
      const replacement = replacements.get(group.sprites[index] ?? 0);
      if (replacement != null) group.sprites[index] = replacement;
    }
  }
}

/** Returns a precise compile error for pixels outside the shared RGB contract. */
export function validateMaterialMaskImage(image: ImageData): string | null {
  const allowed = new Set<number>(Object.values(MATERIAL_MASK_COLORS));
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3];
    if (alpha === 0) continue;
    const pixel = offset >>> 2;
    if (alpha !== 0xFF) return `pixel ${pixel} has alpha ${alpha}; masks require alpha 0 or 255`;
    const rgb = (image.data[offset] << 16) | (image.data[offset + 1] << 8) | image.data[offset + 2];
    if (!allowed.has(rgb)) {
      return `pixel ${pixel} uses unsupported #${rgb.toString(16).padStart(6, '0')}`;
    }
  }
  return null;
}

/** Upgrades pre-contract white/partial-alpha pixels before EOBJ v15 output. */
export function normalizeLegacyMaterialMaskImage(image: ImageData): boolean {
  const leather = MATERIAL_MASK_COLORS[MATERIAL_MASK_KINDS.leather];
  const leatherRed = leather >>> 16;
  const leatherGreen = (leather >>> 8) & 0xFF;
  const leatherBlue = leather & 0xFF;
  const allowed = new Set<number>(Object.values(MATERIAL_MASK_COLORS));
  let changed = false;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3];
    if (alpha === 0) continue;
    let rgb = (image.data[offset] << 16) | (image.data[offset + 1] << 8) | image.data[offset + 2];
    if (rgb === 0xFFFFFF) {
      image.data[offset] = leatherRed;
      image.data[offset + 1] = leatherGreen;
      image.data[offset + 2] = leatherBlue;
      rgb = leather;
      changed = true;
    }
    if (allowed.has(rgb) && alpha !== 0xFF) {
      image.data[offset + 3] = 0xFF;
      changed = true;
    }
  }
  return changed;
}

export function applyMaterialMask(
  base: ImageData,
  mask: ImageData,
  color: number,
): void {
  const red = (color >>> 16) & 0xFF;
  const green = (color >>> 8) & 0xFF;
  const blue = color & 0xFF;
  const baseBytes = base.data;
  const maskBytes = mask.data;

  for (let offset = 0; offset < baseBytes.length; offset += 4) {
    const alpha = maskBytes[offset + 3] / 0xFF;
    if (alpha <= 0) continue;

    const tintedRed = (baseBytes[offset] * red) / 0xFF;
    const tintedGreen = (baseBytes[offset + 1] * green) / 0xFF;
    const tintedBlue = (baseBytes[offset + 2] * blue) / 0xFF;
    baseBytes[offset] += (tintedRed - baseBytes[offset]) * alpha;
    baseBytes[offset + 1] += (tintedGreen - baseBytes[offset + 1]) * alpha;
    baseBytes[offset + 2] += (tintedBlue - baseBytes[offset + 2]) * alpha;
  }
}

export function materialColorToCSS(color: number): string {
  return `#${Math.max(0, Math.min(0xFFFFFF, color)).toString(16).padStart(6, '0')}`;
}

export function materialColorFromCSS(value: string): number {
  return Number.parseInt(value.replace(/^#/, ''), 16) || 0;
}

/** Paints an interpolated square-brush stroke into a material mask in place. */
export function paintMaterialMaskStroke(
  mask: ImageData,
  start: { x: number; y: number },
  end: { x: number; y: number },
  brushSize: number,
  erase: boolean,
  color = 0xFFFFFF,
  base?: ImageData | null,
): void {
  const size = Math.max(1, Math.min(8, Math.round(brushSize)));
  const brushStart = -Math.floor((size - 1) / 2);
  const steps = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y), 1);
  const red = erase ? 0 : (color >>> 16) & 0xFF;
  const green = erase ? 0 : (color >>> 8) & 0xFF;
  const blue = erase ? 0 : color & 0xFF;
  const alpha = erase ? 0 : 0xFF;

  for (let step = 0; step <= steps; step++) {
    const x = Math.round(start.x + (end.x - start.x) * step / steps);
    const y = Math.round(start.y + (end.y - start.y) * step / steps);
    for (let brushY = brushStart; brushY < brushStart + size; brushY++) {
      for (let brushX = brushStart; brushX < brushStart + size; brushX++) {
        const targetX = x + brushX;
        const targetY = y + brushY;
        if (targetX < 0 || targetY < 0 || targetX >= mask.width || targetY >= mask.height) continue;
        if (!erase && base !== undefined && (!base || targetX >= base.width || targetY >= base.height
          || base.data[(targetY * base.width + targetX) * 4 + 3] === 0)) continue;
        const offset = (targetY * mask.width + targetX) * 4;
        mask.data[offset] = red;
        mask.data[offset + 1] = green;
        mask.data[offset + 2] = blue;
        mask.data[offset + 3] = alpha;
      }
    }
  }
}

/** Shows the semantic RGB mask over the base without changing stored pixels. */
export function applyMaterialMaskDebugOverlay(base: ImageData, mask: ImageData): void {
  for (let offset = 0; offset < base.data.length; offset += 4) {
    const alpha = (mask.data[offset + 3] / 0xFF) * 0.72;
    if (alpha <= 0) continue;
    base.data[offset] += (mask.data[offset] - base.data[offset]) * alpha;
    base.data[offset + 1] += (mask.data[offset + 1] - base.data[offset + 1]) * alpha;
    base.data[offset + 2] += (mask.data[offset + 2] - base.data[offset + 2]) * alpha;
  }
}
import { MATERIAL_MASK_KINDS } from './types';
import type { MaterialMaskKind } from './types';
import {
  MATERIAL_MASK_RGB_CLOTH,
  MATERIAL_MASK_RGB_LEATHER,
  MATERIAL_MASK_RGB_METAL,
  MATERIAL_MASK_RGB_WOOD,
} from './material-mask-contract.generated';

export const MATERIAL_MASK_COLORS: Record<MaterialMaskKind, number> = {
  [MATERIAL_MASK_KINDS.metal]: MATERIAL_MASK_RGB_METAL,
  [MATERIAL_MASK_KINDS.leather]: MATERIAL_MASK_RGB_LEATHER,
  [MATERIAL_MASK_KINDS.cloth]: MATERIAL_MASK_RGB_CLOTH,
  [MATERIAL_MASK_KINDS.wood]: MATERIAL_MASK_RGB_WOOD,
};
