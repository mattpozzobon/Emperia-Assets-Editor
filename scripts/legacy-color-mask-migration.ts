import { COLOR_MASK_COLORS } from './legacy-outfit-colors';
import type { ThingType } from '../src/lib/types';
import type { OutfitColorIndices } from './legacy-outfit-colors';

export type ColorMaskChannel = keyof OutfitColorIndices;
export const COLOR_MASK_CHANNEL_ORDER: ColorMaskChannel[] = ['head', 'body', 'legs', 'feet'];
export const COLOR_MASK_REGION_LABELS: Record<ColorMaskChannel, string> = {
  head: 'Primary', body: 'Secondary', legs: 'Tertiary', feet: 'Quaternary',
};

/** Compact occupied channels, preserving yellow first and never merging regions. */
export function planColorMaskMigration(used: ReadonlySet<ColorMaskChannel>): Partial<Record<ColorMaskChannel, ColorMaskChannel>> {
  const mapping: Partial<Record<ColorMaskChannel, ColorMaskChannel>> = {};
  let index = 0;
  for (const channel of COLOR_MASK_CHANNEL_ORDER) {
    if (used.has(channel)) mapping[channel] = COLOR_MASK_CHANNEL_ORDER[index++];
  }
  return mapping;
}

export function inspectColorMask(image: Pick<ImageData, 'data'>): { channels: Set<ColorMaskChannel>; invalidPixels: number; invalidColors: string[] } {
  const channels = new Set<ColorMaskChannel>();
  const invalidColors = new Set<string>();
  let invalidPixels = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3] === 0) continue;
    const rgb = (image.data[offset] << 16) | (image.data[offset + 1] << 8) | image.data[offset + 2];
    const channel = COLOR_MASK_CHANNEL_ORDER.find(key => COLOR_MASK_COLORS[key] === rgb);
    if (!channel || image.data[offset + 3] !== 255) {
      invalidPixels++;
      if (invalidColors.size < 8) invalidColors.add(`#${rgb.toString(16).padStart(6, '0')} alpha=${image.data[offset + 3]}`);
    }
    else channels.add(channel);
  }
  return { channels, invalidPixels, invalidColors: Array.from(invalidColors) };
}

/** Mutates only known region pixels; transparency and unrecognized pixels survive. */
export function remapColorMaskPixels(image: Pick<ImageData, 'data'>, mapping: Partial<Record<ColorMaskChannel, ColorMaskChannel>>): void {
  const replacements = new Map<number, number>();
  for (const from of COLOR_MASK_CHANNEL_ORDER) {
    const to = mapping[from];
    if (to) replacements.set(COLOR_MASK_COLORS[from], COLOR_MASK_COLORS[to]);
  }
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3] !== 255) continue;
    const rgb = (image.data[offset] << 16) | (image.data[offset + 1] << 8) | image.data[offset + 2];
    const replacement = replacements.get(rgb);
    if (replacement == null) continue;
    image.data[offset] = replacement >>> 16;
    image.data[offset + 1] = (replacement >>> 8) & 255;
    image.data[offset + 2] = replacement & 255;
  }
}

/** Apply to resolved per-piece colors, after the client's legacy slot fallbacks. */
export function remapColorMaskPalette(colors: OutfitColorIndices, mapping: Partial<Record<ColorMaskChannel, ColorMaskChannel>>): OutfitColorIndices {
  const result: OutfitColorIndices = { head: 0, body: 0, legs: 0, feet: 0 };
  for (const from of COLOR_MASK_CHANNEL_ORDER) {
    const to = mapping[from];
    if (to) result[to] = colors[from];
  }
  return result;
}

/** Extend a migrated piece only when a new region is actually authored. */
export function ensureColorMaskRegion(thing: ThingType, region: ColorMaskChannel): void {
  if (region !== 'head' && region !== 'body') throw new Error('Color masks support only Primary and Secondary');
  if (!thing.colorMaskSources) return;
  const index = COLOR_MASK_CHANNEL_ORDER.indexOf(region);
  while (thing.colorMaskSources.length <= index) {
    const preferred = thing.colorMaskSources.length;
    const source = !thing.colorMaskSources.includes(preferred) ? preferred
      : [0, 1, 2, 3].find(value => !thing.colorMaskSources!.includes(value))!;
    thing.colorMaskSources.push(source);
  }
}
