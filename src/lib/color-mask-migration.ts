import type { OutfitColorIndices } from './outfit-colors';
import type { ThingType } from './types';
export type ColorMaskChannel = keyof OutfitColorIndices;
export const COLOR_MASK_REGION_LABELS: Record<ColorMaskChannel, string> = { primary: 'Primary', secondary: 'Secondary' };
export function ensureColorMaskRegion(thing: ThingType, region: ColorMaskChannel): void {
  if (region !== 'primary' && region !== 'secondary') throw new Error('Unsupported colour-mask region');
  thing.colorMaskSources = region === 'secondary' || thing.colorMaskSources?.length === 2 ? [0, 1] : [0];
}
