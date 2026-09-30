import type { FrameGroup } from './types';

/**
 * Changes the layer stride without moving sprites to another appearance.
 *
 * Layers are stored inside every frame/pattern combination, so simply growing
 * or truncating the sprites array shifts all combinations after the first one.
 * New layers are empty and removing layers keeps the first `newLayerCount`.
 */
export function resizeFrameGroupLayers(group: FrameGroup, newLayerCount: number): void {
  const oldLayerCount = group.layers;
  if (newLayerCount === oldLayerCount) return;

  const tilesPerLayer = group.width * group.height;
  const appearanceCount = group.patternX
    * group.patternY
    * group.patternZ
    * group.animationLength;
  const retainedLayerCount = Math.min(oldLayerCount, newLayerCount);
  const resizedSprites = new Array(
    appearanceCount * newLayerCount * tilesPerLayer,
  ).fill(0);

  for (let appearance = 0; appearance < appearanceCount; appearance++) {
    for (let layer = 0; layer < retainedLayerCount; layer++) {
      const oldStart = (appearance * oldLayerCount + layer) * tilesPerLayer;
      const newStart = (appearance * newLayerCount + layer) * tilesPerLayer;

      for (let tile = 0; tile < tilesPerLayer; tile++) {
        resizedSprites[newStart + tile] = group.sprites[oldStart + tile] ?? 0;
      }
    }
  }

  group.layers = newLayerCount;
  group.sprites = resizedSprites;
}

/** Removes every reference from one layer without disturbing frame strides. */
export function clearFrameGroupLayer(group: FrameGroup, layer: number): void {
  if (layer < 0 || layer >= group.layers) return;
  const tilesPerLayer = group.width * group.height;
  const appearanceCount = group.patternX
    * group.patternY
    * group.patternZ
    * group.animationLength;
  for (let appearance = 0; appearance < appearanceCount; appearance++) {
    const start = (appearance * group.layers + layer) * tilesPerLayer;
    group.sprites.fill(0, start, start + tilesPerLayer);
  }
}
