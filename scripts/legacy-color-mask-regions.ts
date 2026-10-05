/** EOBJ v16 region order is Primary/Secondary/Tertiary/Quaternary.
 * Resolve saved legacy colors first (including base-outfit fallbacks), then map.
 * Keeping the source mapping in the asset avoids rewriting player/NPC records.
 */
export function resolveColorRegionPalette(legacy: readonly number[], sources?: readonly number[]): number[] {
  if (!sources) return Array.from(legacy);
  return [0, 1, 2, 3].map(region => sources[region] == null ? 0xFFFFFF : legacy[sources[region]]);
}
export const COLOR_REGION_LABELS = ['Primary', 'Secondary', 'Tertiary', 'Quaternary'] as const;
export const LEGACY_COLOR_KEYS = ['yellow', 'red', 'green', 'blue'] as const;

export function buildColorMaskSpriteSources(objects: readonly ({ frameGroups: readonly {
  width: number; height: number; layers: number; sprites: readonly number[]; colorMaskSources?: readonly number[];
}[] } | undefined)[]): Map<number, readonly number[]> {
  const result = new Map<number, readonly number[]>();
  for (const object of objects) for (const group of object?.frameGroups ?? []) {
    if (!group.colorMaskSources) continue;
    const tiles = group.width * group.height;
    for (let i = 0; i < group.sprites.length; i++) {
      if (Math.floor(i / tiles) % group.layers !== 1 || !group.sprites[i]) continue;
      const previous = result.get(group.sprites[i]);
      if (previous && previous.some((source, index) => group.colorMaskSources![index] != null && source !== group.colorMaskSources![index])) throw new Error('Shared color mask has conflicting region mappings');
      if (!previous || previous.length < group.colorMaskSources.length) result.set(group.sprites[i], group.colorMaskSources);
    }
  }
  return result;
}
