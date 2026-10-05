import { useCallback, useEffect, useMemo, useState } from 'react';
import { CopyPlus } from 'lucide-react';
import { useOBStore } from '../store';
import { clearSpriteCache, clearSpriteCacheId, decodeSprite } from '../lib/sprite-decoder';
import { COLOR_MASK_COLORS, getColorMaskLayer, paletteToCSS, OUTFIT_PALETTE, PALETTE_SIZE } from '../lib/outfit-colors';
import type { OutfitColorIndices } from '../lib/outfit-colors';
import { COLOR_MASK_REGION_LABELS, ensureColorMaskRegion } from '../lib/color-mask-migration';
import { clearFrameGroupLayer, resizeFrameGroupLayers } from '../lib/frame-group-layout';
import { collectMaterialBaseSpriteIds, desaturateSprite, fillMaterialMaskFromBrightness, fillMaterialMaskFromNonBlackPixels, findSharedMaterialMaskSpriteIds, materialColorToCSS, MATERIAL_MASK_COLORS, remapMaterialMaskSpriteIds } from '../lib/material-mask';
import { MATERIAL_MASK_KINDS } from '../lib/types';
import type { MaterialMaskKind } from '../lib/types';
import { ParamField, StepperBtn } from './ui-primitives';

const COLOR_MASK_OPTIONS = (['primary', 'secondary'] as const).map(kind => ({
  kind: kind as keyof OutfitColorIndices, label: COLOR_MASK_REGION_LABELS[kind as keyof OutfitColorIndices], color: materialColorToCSS(COLOR_MASK_COLORS[kind]),
}));

const MAX_ANIMATION_FRAME_DURATION_MS = 0xFFFF_FFFF;
const MATERIAL_MASK_OPTIONS: { kind: MaterialMaskKind; label: string; color: string }[] = [
  { kind: MATERIAL_MASK_KINDS.leather, label: 'Leather', color: materialColorToCSS(MATERIAL_MASK_COLORS[MATERIAL_MASK_KINDS.leather]) },
  { kind: MATERIAL_MASK_KINDS.cloth, label: 'Cloth', color: materialColorToCSS(MATERIAL_MASK_COLORS[MATERIAL_MASK_KINDS.cloth]) },
  { kind: MATERIAL_MASK_KINDS.metal, label: 'Metal', color: materialColorToCSS(MATERIAL_MASK_COLORS[MATERIAL_MASK_KINDS.metal]) },
  { kind: MATERIAL_MASK_KINDS.wood, label: 'Wood', color: materialColorToCSS(MATERIAL_MASK_COLORS[MATERIAL_MASK_KINDS.wood]) },
];

export function LayerPanel() {
  const [brightnessThreshold, setBrightnessThreshold] = useState(128);
  const [brightnessMode, setBrightnessMode] = useState<'light' | 'dark'>('light');
  const selectedId = useOBStore((s) => s.selectedThingId);
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const category = useOBStore((s) => s.activeCategory);
  const editVersion = useOBStore((s) => s.editVersion);

  const blendLayers = useOBStore((s) => s.blendLayers);
  const currentFrame = useOBStore((s) => s.currentFrame);
  const playing = useOBStore((s) => s.playing);
  const outfitColors = useOBStore((s) => s.outfitColors);
  const showColorPicker = useOBStore((s) => s.showColorPicker);
  const materialMaskPaintMode = useOBStore((s) => s.materialMaskPaintMode);
  const materialMaskBrushSize = useOBStore((s) => s.materialMaskBrushSize);
  const activeMaterialMaskKind = useOBStore((s) => s.activeMaterialMaskKind);
  const activeColorMaskRegion = useOBStore((s) => s.activeColorMaskRegion);
  const activeGroup = useOBStore((s) => s.activeGroup);

  const thing = selectedId != null ? objectData?.things.get(selectedId) ?? null : null;
  const isDirectionalAppearance = (
    category === 'outfit'
    || category === 'equipment'
    || category === 'hair'
  );
  const isEffect = category === 'effect';
  const isItem = category === 'item';
  const supportsMaterialMask = isItem || category === 'outfit' || category === 'equipment';

  const group = thing?.frameGroups[activeGroup] ?? null;
  const activeGroupLabel = activeGroup === 0 ? 'Idle' : activeGroup === 1 ? 'Moving' : `Group ${activeGroup}`;
  const hasMultipleLayers = group ? group.layers > 1 : false;
  const isAnimated = group ? group.animationLength > 1 : false;
  const showOffset = isDirectionalAppearance || isEffect || (thing?.flags.hasDisplacement ?? false);
  const hasColorMask = supportsMaterialMask && getColorMaskLayer(thing) != null;
  const showColors = (hasColorMask || category === 'hair') && blendLayers && (group?.layers ?? 0) >= 2;
  const hasMaterialMask = supportsMaterialMask && thing?.materialMaskLayer != null;
  const hasMask = hasMaterialMask || hasColorMask;
  const activeMaterialMaskLayer = thing?.materialMaskLayer ?? (hasColorMask ? 1 : undefined);
  const activeMaskColor = hasColorMask ? COLOR_MASK_COLORS[activeColorMaskRegion] : MATERIAL_MASK_COLORS[activeMaterialMaskKind];
  const activeMaterialMaskLabel = hasColorMask ? COLOR_MASK_OPTIONS.find(option => option.kind === activeColorMaskRegion)!.label : MATERIAL_MASK_OPTIONS.find((option) => option.kind === activeMaterialMaskKind)?.label ?? 'Material';
  const sharedMaterialMaskSpriteIdsByGroup = useMemo(() => {
    if (!objectData || !thing || activeMaterialMaskLayer == null) return [];
    return thing.frameGroups.map((frameGroup) => (
      findSharedMaterialMaskSpriteIds(objectData.things.values(), thing, frameGroup, activeMaterialMaskLayer)
    ));
  }, [activeMaterialMaskLayer, editVersion, objectData, thing]);
  const activeSharedMaterialMaskSpriteIds = sharedMaterialMaskSpriteIdsByGroup[activeGroup] ?? [];
  const hasActiveGroupSharedMaterialMasks = activeSharedMaterialMaskSpriteIds.length > 0;
  const sharedMaterialMaskReferenceCount = sharedMaterialMaskSpriteIdsByGroup.reduce(
    (total, spriteIds) => total + spriteIds.length,
    0,
  );
  const hasSharedMaterialMasks = sharedMaterialMaskReferenceCount > 0;

  useEffect(() => {
    if (hasActiveGroupSharedMaterialMasks && materialMaskPaintMode) {
      useOBStore.setState({ materialMaskPaintMode: null });
    }
  }, [hasActiveGroupSharedMaterialMasks, materialMaskPaintMode]);

  const markThingDirty = useCallback(() => {
    if (!thing) return;
    thing.rawBytes = undefined;
    clearSpriteCache();
    const store = useOBStore.getState();
    const newDirtyIds = new Set(store.dirtyIds);
    newDirtyIds.add(thing.id);
    useOBStore.setState({ dirty: true, dirtyIds: newDirtyIds, editVersion: store.editVersion + 1 });
  }, [thing]);

  const setMaterialMaskEnabled = useCallback((enabled: boolean) => {
    if (!thing || !supportsMaterialMask) return;
    if (enabled) {
      for (const frameGroup of thing.frameGroups) {
        if (frameGroup.layers < 2) resizeFrameGroupLayers(frameGroup, 2);
      }
      delete thing.colorMaskSources;
      thing.materialMaskLayer = 1;
      useOBStore.setState({ activeMaterialMaskKind: MATERIAL_MASK_KINDS.leather, activeLayer: 1, blendLayers: true, materialMaskPaintMode: null, selectedSlots: [] });
    } else {
      for (const frameGroup of thing.frameGroups) {
        clearFrameGroupLayer(frameGroup, 1);
        if (frameGroup.layers === 2) resizeFrameGroupLayers(frameGroup, 1);
      }
      delete thing.materialMaskLayer;
      useOBStore.setState({ activeLayer: 0, blendLayers: false, materialMaskPaintMode: null, selectedSlots: [] });
    }
    markThingDirty();
  }, [markThingDirty, supportsMaterialMask, thing]);

  const setColorMaskEnabled = useCallback((enabled: boolean) => {
    if (!thing || !supportsMaterialMask || thing.materialMaskLayer != null) return;
    if (!enabled && thing.frameGroups.some(frameGroup => frameGroup.layers > 2)) return;
    for (const frameGroup of thing.frameGroups) {
      if (enabled && frameGroup.layers < 2) resizeFrameGroupLayers(frameGroup, 2);
      if (!enabled) resizeFrameGroupLayers(frameGroup, 1);
    }
    if (enabled) thing.colorMaskSources = [0];
    else delete thing.colorMaskSources;
    useOBStore.setState({ activeColorMaskRegion: 'primary', activeLayer: enabled ? 1 : 0, blendLayers: enabled, materialMaskPaintMode: null, selectedSlots: [] });
    markThingDirty();
  }, [markThingDirty, supportsMaterialMask, thing]);

  const selectColorMaskRegion = useCallback((region: 'primary' | 'secondary') => {
    if (!thing) return;
    useOBStore.setState({ activeColorMaskRegion: region, activeLayer: 1, blendLayers: false, selectedSlots: [] });
  }, [thing, markThingDirty]);

  const selectMaterialMaskColor = useCallback((kind: MaterialMaskKind) => {
    if (!thing || !hasMaterialMask) return;
    useOBStore.setState({
      activeMaterialMaskKind: kind,
      activeLayer: thing.materialMaskLayer!,
      blendLayers: false,
      selectedSlots: [],
    });
  }, [hasMaterialMask, thing]);

  const setPaintMode = useCallback((mode: 'paint' | 'erase') => {
    if (activeMaterialMaskLayer == null || hasActiveGroupSharedMaterialMasks) return;
    useOBStore.setState({
      activeLayer: activeMaterialMaskLayer,
      blendLayers: false,
      materialMaskPaintMode: materialMaskPaintMode === mode ? null : mode,
      selectedSlots: [],
    });
  }, [activeMaterialMaskLayer, hasActiveGroupSharedMaterialMasks, materialMaskPaintMode]);

  const makeMaterialMasksUnique = useCallback(() => {
    if (!thing || !spriteData || activeMaterialMaskLayer == null || !hasSharedMaterialMasks) return;

    const store = useOBStore.getState();
    const spriteOverrides = new Map(store.spriteOverrides);
    const dirtySpriteIds = new Set(store.dirtySpriteIds);
    const dirtyIds = new Set(store.dirtyIds);
    let nextSpriteId = spriteData.spriteCount;
    let replacementCount = 0;

    for (let groupIndex = 0; groupIndex < thing.frameGroups.length; groupIndex++) {
      const frameGroup = thing.frameGroups[groupIndex];
      const sharedSpriteIds = sharedMaterialMaskSpriteIdsByGroup[groupIndex] ?? [];
      const replacements = new Map<number, number>();

      for (const spriteId of sharedSpriteIds) {
        const source = spriteOverrides.get(spriteId) ?? decodeSprite(spriteData, spriteId);
        if (!source) continue;
        const newSpriteId = ++nextSpriteId;
        replacements.set(spriteId, newSpriteId);
        // Preserve legacy color regions when isolating an existing color mask.
        // Material masks keep the existing fresh-mask behavior.
        spriteOverrides.set(newSpriteId, hasColorMask
          ? new ImageData(new Uint8ClampedArray(source.data), source.width, source.height)
          : new ImageData(source.width, source.height));
        dirtySpriteIds.add(newSpriteId);
      }

      if (replacements.size > 0) {
        remapMaterialMaskSpriteIds([frameGroup], activeMaterialMaskLayer, replacements);
        replacementCount += replacements.size;
      }
    }

    if (replacementCount === 0) return;
    spriteData.spriteCount = nextSpriteId;
    thing.rawBytes = undefined;
    dirtyIds.add(thing.id);
    clearSpriteCache();
    useOBStore.setState({
      dirty: true,
      dirtyIds,
      spriteOverrides,
      dirtySpriteIds,
      materialMaskPaintMode: null,
      selectedSlots: [],
      editVersion: store.editVersion + 1,
    });
  }, [activeMaterialMaskLayer, hasColorMask, hasSharedMaterialMasks, sharedMaterialMaskSpriteIdsByGroup, spriteData, thing]);

  const desaturateBaseSprites = useCallback(() => {
    if (!thing || !spriteData || activeMaterialMaskLayer == null) return;

    const spriteIds = collectMaterialBaseSpriteIds(thing.frameGroups, activeMaterialMaskLayer);
    if (spriteIds.length === 0) return;

    const store = useOBStore.getState();
    const spriteOverrides = new Map(store.spriteOverrides);
    const dirtySpriteIds = new Set(store.dirtySpriteIds);

    for (const spriteId of spriteIds) {
      const source = spriteOverrides.get(spriteId) ?? decodeSprite(spriteData, spriteId);
      if (!source) continue;

      const desaturated = new ImageData(
        new Uint8ClampedArray(source.data),
        source.width,
        source.height,
      );
      desaturateSprite(desaturated);
      spriteOverrides.set(spriteId, desaturated);
      dirtySpriteIds.add(spriteId);
      clearSpriteCacheId(spriteId);
    }

    useOBStore.setState({
      dirty: true,
      spriteOverrides,
      dirtySpriteIds,
      editVersion: store.editVersion + 1,
    });
  }, [activeMaterialMaskLayer, spriteData, thing]);

  const createMasksFromPixels = useCallback((byBrightness: boolean) => {
    if (!thing || !spriteData || activeMaterialMaskLayer == null || hasSharedMaterialMasks) return;

    const store = useOBStore.getState();
    const spriteOverrides = new Map(store.spriteOverrides);
    const dirtySpriteIds = new Set(store.dirtySpriteIds);
    const dirtyIds = new Set(store.dirtyIds);
    const maskOwners = new Map<number, number>();
    if (hasColorMask) ensureColorMaskRegion(thing, activeColorMaskRegion);
    const materialColor = activeMaskColor;
    let nextSpriteId = spriteData.spriteCount;
    let changed = false;

    for (const frameGroup of thing.frameGroups) {
      if (activeMaterialMaskLayer >= frameGroup.layers) continue;
      const tilesPerLayer = frameGroup.width * frameGroup.height;
      if (tilesPerLayer <= 0) continue;
      const appearanceCount = frameGroup.patternX
        * frameGroup.patternY
        * frameGroup.patternZ
        * frameGroup.animationLength;

      for (let appearance = 0; appearance < appearanceCount; appearance++) {
        for (let tile = 0; tile < tilesPerLayer; tile++) {
          const appearanceStart = appearance * frameGroup.layers * tilesPerLayer;
          const baseIndex = appearanceStart + tile;
          const maskIndex = appearanceStart + activeMaterialMaskLayer * tilesPerLayer + tile;
          const baseSpriteId = frameGroup.sprites[baseIndex] ?? 0;
          if (baseSpriteId <= 0 || maskIndex >= frameGroup.sprites.length) continue;

          const base = spriteOverrides.get(baseSpriteId) ?? decodeSprite(spriteData, baseSpriteId);
          if (!base) continue;

          let maskSpriteId = frameGroup.sprites[maskIndex] ?? 0;
          const existingMask = maskSpriteId > 0
            ? store.spriteOverrides.get(maskSpriteId) ?? decodeSprite(spriteData, maskSpriteId)
            : null;

          const existingOwner = maskOwners.get(maskSpriteId);
          if (maskSpriteId <= 0 || (existingOwner != null && existingOwner !== baseSpriteId)) {
            maskSpriteId = ++nextSpriteId;
            frameGroup.sprites[maskIndex] = maskSpriteId;
          }

          const mask = existingMask
            ? new ImageData(new Uint8ClampedArray(existingMask.data), existingMask.width, existingMask.height)
            : new ImageData(base.width, base.height);
          if (byBrightness) {
            fillMaterialMaskFromBrightness(base, mask, materialColor, brightnessThreshold, brightnessMode);
          } else {
            fillMaterialMaskFromNonBlackPixels(base, mask, materialColor);
          }
          spriteOverrides.set(maskSpriteId, mask);
          dirtySpriteIds.add(maskSpriteId);
          clearSpriteCacheId(maskSpriteId);
          maskOwners.set(maskSpriteId, baseSpriteId);
          changed = true;
        }
      }
    }

    if (!changed) return;
    spriteData.spriteCount = nextSpriteId;
    thing.rawBytes = undefined;
    dirtyIds.add(thing.id);
    useOBStore.setState({
      dirty: true,
      dirtyIds,
      spriteOverrides,
      dirtySpriteIds,
      ...(byBrightness ? { activeLayer: activeMaterialMaskLayer, blendLayers: false, materialMaskPaintMode: 'paint' as const, selectedSlots: [] } : {}),
      editVersion: store.editVersion + 1,
    });
  }, [activeMaskColor, activeColorMaskRegion, hasColorMask, activeMaterialMaskLayer, hasSharedMaterialMasks, spriteData, thing, brightnessThreshold, brightnessMode]);

  const updateFrameGroupProp = useCallback((key: string, value: number) => {
    if (!thing || !group) return;
    (group as unknown as Record<string, unknown>)[key] = value;

    const total = group.width * group.height * group.layers * group.patternX * group.patternY * group.patternZ * group.animationLength;
    if (group.sprites.length < total) {
      while (group.sprites.length < total) group.sprites.push(0);
    } else if (group.sprites.length > total) {
      group.sprites.length = total;
    }

    while (group.animationLengths.length < group.animationLength) {
      group.animationLengths.push({ min: 100, max: 100 });
    }
    if (group.animationLengths.length > group.animationLength) {
      group.animationLengths.length = group.animationLength;
    }

    thing.rawBytes = undefined;
    clearSpriteCache();
    const store = useOBStore.getState();
    const newDirtyIds = new Set(store.dirtyIds);
    newDirtyIds.add(thing.id);
    useOBStore.setState({ dirty: true, dirtyIds: newDirtyIds, editVersion: store.editVersion + 1 });
  }, [thing, group]);

  if (!thing || (!supportsMaterialMask && !hasMultipleLayers && !showOffset && !isAnimated)) return null;

  return (
    <div className="border-t border-emperia-border text-[10px] space-y-1">

      {supportsMaterialMask && (
        <>
          <div className="px-2 py-1 bg-amber-950/30 border-b border-emperia-border/40">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-400 opacity-90">Masks</span>
          </div>
          <div className="px-3 py-2 space-y-2">
            <div className="flex items-center gap-2">
              <label className="flex min-w-0 items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasMaterialMask}
                  disabled={hasColorMask}
                  title={hasColorMask ? 'Disable color masks first' : undefined}
                  onChange={(event) => setMaterialMaskEnabled(event.target.checked)}
                  className="w-3 h-3 accent-amber-500"
                />
                <span className="text-emperia-text">Use material masks</span>
              </label>
              {hasMask && (
                hasSharedMaterialMasks ? (
                  <button
                    type="button"
                    onClick={makeMaterialMasksUnique}
                    className="ml-auto flex shrink-0 items-center gap-1 rounded border border-amber-400/60 bg-amber-500/15 px-1.5 py-0.5 text-[8px] text-amber-300 hover:bg-amber-500/25"
                    title={`${sharedMaterialMaskReferenceCount} mask reference${sharedMaterialMaskReferenceCount === 1 ? ' is' : 's are'} shared across animation groups or appearances. Create private masks for every group.`}
                  >
                    <CopyPlus className="h-2.5 w-2.5" />
                    Make masks unique ({sharedMaterialMaskReferenceCount})
                  </button>
                ) : (
                  <span
                    className="ml-auto shrink-0 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] text-emerald-400"
                    title="The mask sprite IDs are private in every animation group"
                  >
                    Masks unique
                  </span>
                )
              )}
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={hasColorMask} disabled={hasMaterialMask || (hasColorMask && thing.frameGroups.some(frameGroup => frameGroup.layers > 2))}
                title={hasMaterialMask ? 'Disable material masks first' : hasColorMask && thing.frameGroups.some(frameGroup => frameGroup.layers > 2) ? 'Reduce to two layers before removing the color mask' : undefined}
                onChange={(event) => setColorMaskEnabled(event.target.checked)} className="w-3 h-3 accent-amber-500" />
              <span className="text-emperia-text">Use color masks</span>
            </label>
            {hasMask && (
              <div className="space-y-1.5 rounded border border-amber-500/15 bg-amber-950/10 p-2">
                <div className="flex gap-1">
                  {(hasColorMask ? COLOR_MASK_OPTIONS : MATERIAL_MASK_OPTIONS).map((option) => {
                    const selected = (hasColorMask ? activeColorMaskRegion : activeMaterialMaskKind) === option.kind;
                    return (
                      <button
                        key={option.kind}
                        type="button"
                        onClick={() => hasColorMask
                          ? selectColorMaskRegion(option.kind as 'primary' | 'secondary')
                          : selectMaterialMaskColor(option.kind as MaterialMaskKind)}
                        className={`flex flex-1 items-center justify-center gap-1 rounded border px-1 py-1 text-[8px] ${selected ? 'border-white/50 bg-white/10 text-white' : 'border-emperia-border text-emperia-muted hover:text-emperia-text'}`}
                        title={`Paint ${option.label} regions`}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: option.color }} />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-emperia-muted">All mask colors share layer {activeMaterialMaskLayer != null ? activeMaterialMaskLayer + 1 : '—'}</span>
                </div>
                <button
                  type="button"
                  onClick={desaturateBaseSprites}
                  className="w-full rounded border border-emperia-border px-2 py-1 text-[9px] text-emperia-muted hover:border-amber-400/60 hover:text-emperia-text"
                  title="Set HSV saturation to zero for Idle and Moving sprites, excluding the mask layer"
                >
                  Set Idle + Moving saturation to 0
                </button>
                <button
                  type="button"
                  onClick={() => createMasksFromPixels(false)}
                  disabled={hasSharedMaterialMasks}
                  className="w-full rounded border border-amber-500/30 bg-amber-950/20 px-2 py-1 text-[9px] text-amber-300 hover:border-amber-400/70 hover:bg-amber-950/35 disabled:cursor-not-allowed disabled:opacity-40"
                  title={hasSharedMaterialMasks
                    ? 'Make the shared mask IDs unique in every animation group before creating masks'
                    : `Add ${activeMaterialMaskLabel} to visible, non-black pixels in Idle and Moving that do not already have a mask region`}
                >
                  Create Idle + Moving {activeMaterialMaskLabel} masks
                </button>
                <div className="space-y-1.5 rounded border border-emperia-border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-emperia-text">Mask by brightness</span>
                    <select aria-label="Brightness selection" value={brightnessMode}
                      onChange={(event) => setBrightnessMode(event.target.value as 'light' | 'dark')}
                      className="rounded border border-emperia-border bg-emperia-surface text-[9px] text-emperia-text">
                      <option value="light">Light pixels</option>
                      <option value="dark">Dark pixels</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2">
                    <span className="text-emperia-muted">Threshold</span>
                    <input type="range" min={0} max={255} value={brightnessThreshold}
                      onChange={(event) => setBrightnessThreshold(Number(event.target.value))}
                      className="min-w-0 flex-1 accent-amber-500" />
                    <span className="w-6 text-right font-mono text-emperia-text">{brightnessThreshold}</span>
                  </label>
                  <p className="text-[8px] leading-relaxed text-emperia-muted">
                    {brightnessMode === 'light' ? `Brightness ≥ ${brightnessThreshold}` : `Brightness < ${brightnessThreshold}`} (0 = black, 255 = white).
                    {' '}Replaces {activeMaterialMaskLabel} in all groups, directions and frames. Other painted regions are preserved.
                  </p>
                  <button type="button" onClick={() => createMasksFromPixels(true)}
                    disabled={!spriteData || hasSharedMaterialMasks}
                    title={hasSharedMaterialMasks ? 'Make masks unique before generating by brightness' : 'Apply the threshold and show the generated mask'}
                    className="w-full rounded border border-amber-500/30 bg-amber-950/20 px-2 py-1 text-[9px] text-amber-300 hover:border-amber-400/70 disabled:cursor-not-allowed disabled:opacity-40">
                    Apply brightness to {activeMaterialMaskLabel}
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <span className="mr-auto text-emperia-muted">Edit mask</span>
                  <button
                    type="button"
                    onClick={() => setPaintMode('paint')}
                    disabled={hasActiveGroupSharedMaterialMasks}
                    title={hasActiveGroupSharedMaterialMasks ? 'Make the shared mask IDs unique before editing' : 'Paint the selected region'}
                    className={`rounded border px-2 py-1 text-[9px] disabled:cursor-not-allowed disabled:opacity-40 ${materialMaskPaintMode === 'paint' ? 'border-amber-400 bg-amber-500/20 text-amber-300' : 'border-emperia-border text-emperia-muted hover:text-emperia-text'}`}
                  >Paint</button>
                  <button
                    type="button"
                    onClick={() => setPaintMode('erase')}
                    disabled={hasActiveGroupSharedMaterialMasks}
                    title={hasActiveGroupSharedMaterialMasks ? 'Make the shared mask IDs unique before editing' : 'Erase mask pixels'}
                    className={`rounded border px-2 py-1 text-[9px] disabled:cursor-not-allowed disabled:opacity-40 ${materialMaskPaintMode === 'erase' ? 'border-amber-400 bg-amber-500/20 text-amber-300' : 'border-emperia-border text-emperia-muted hover:text-emperia-text'}`}
                  >Erase</button>
                </div>
                <label className="flex items-center gap-2">
                  <span className="text-emperia-muted">Brush</span>
                  <input
                    type="range"
                    min={1}
                    max={8}
                    value={materialMaskBrushSize}
                    onChange={(event) => useOBStore.setState({ materialMaskBrushSize: Number(event.target.value) })}
                    className="min-w-0 flex-1 accent-amber-500"
                  />
                  <span className="w-4 text-right font-mono text-emperia-text">{materialMaskBrushSize}</span>
                </label>
                <p className="text-[8px] leading-relaxed text-emperia-muted">
                  Hold left mouse to paint and right mouse to erase. {hasColorMask ? 'Primary is yellow; Secondary is red.' : 'Leather is orange, Cloth is purple, Metal is blue, and Wood is green.'} The item stays visible as a translucent guide.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── ANIMATION ── */}
      {isAnimated && group && (
        <>
          <div className="px-2 py-1 bg-emerald-950/30 border-y border-emperia-border/40">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400 opacity-80">Animation</span>
          </div>
          <div className="px-3 py-2.5 space-y-2.5">
            {/* Frame stepper + play */}
            <div className="flex items-center gap-1">
              <span className="text-emperia-muted shrink-0">Frame:</span>
              <StepperBtn onClick={() => { useOBStore.setState({ currentFrame: (currentFrame - 1 + group.animationLength) % group.animationLength, playing: false }); }}>‹</StepperBtn>
              <span className="text-emperia-text font-mono min-w-10 px-1 text-center text-[9px] tabular-nums whitespace-nowrap">{currentFrame + 1}/{group.animationLength}</span>
              <StepperBtn onClick={() => { useOBStore.setState({ currentFrame: (currentFrame + 1) % group.animationLength, playing: false }); }}>›</StepperBtn>
              <button
                onClick={() => useOBStore.setState({ playing: !playing })}
                className={`ml-1 px-1.5 py-0.5 rounded text-[9px] transition-colors ${playing ? 'bg-emperia-accent text-white' : 'bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-emperia-text'}`}
              >{playing ? 'Stop' : 'Play'}</button>
            </div>

            {/* Settings */}
            <div className="bg-emperia-surface/40 rounded px-2.5 py-2 space-y-2">
              <div className="flex items-center gap-1">
                <span className="text-emperia-muted shrink-0">Mode:</span>
                <select
                  value={group.asynchronous}
                  onChange={(e) => updateFrameGroupProp('asynchronous', Number(e.target.value))}
                  className="flex-1 px-1 py-0.5 bg-emperia-surface border border-emperia-border rounded text-[9px] text-emperia-text outline-none focus:border-emperia-accent"
                >
                  <option value={0}>Sync</option>
                  <option value={1}>Async</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <ParamField label="Loop count" value={group.nLoop} min={0} max={255} onChange={(v) => updateFrameGroupProp('nLoop', v)} />
                <ParamField label="Start frame" value={group.start} min={0} max={group.animationLength - 1} onChange={(v) => updateFrameGroupProp('start', v)} />
              </div>
            </div>

            {/* Per-frame durations */}
            {group.animationLengths[currentFrame] && (
              <div className="bg-emerald-950/20 border border-emerald-500/10 rounded px-2.5 py-2 space-y-1.5">
                <div className="text-[8px] text-emerald-400/70 font-medium">
                  {activeGroupLabel} · Frame {currentFrame + 1} duration (ms)
                </div>
                <div className="grid grid-cols-1 gap-y-1.5">
                  <ParamField
                    label="Min"
                    value={group.animationLengths[currentFrame].min}
                    min={0}
                    max={MAX_ANIMATION_FRAME_DURATION_MS}
                    inputClassName="w-24"
                    onChange={(v) => {
                      group.animationLengths[currentFrame].min = v;
                      thing.rawBytes = undefined;
                      const store = useOBStore.getState();
                      const ids = new Set(store.dirtyIds); ids.add(thing.id);
                      useOBStore.setState({ dirty: true, dirtyIds: ids, editVersion: store.editVersion + 1 });
                    }}
                  />
                  <ParamField
                    label="Max"
                    value={group.animationLengths[currentFrame].max}
                    min={0}
                    max={MAX_ANIMATION_FRAME_DURATION_MS}
                    inputClassName="w-24"
                    onChange={(v) => {
                      group.animationLengths[currentFrame].max = v;
                      thing.rawBytes = undefined;
                      const store = useOBStore.getState();
                      const ids = new Set(store.dirtyIds); ids.add(thing.id);
                      useOBStore.setState({ dirty: true, dirtyIds: ids, editVersion: store.editVersion + 1 });
                    }}
                  />
                </div>
                <SetAllDurations
                  key={activeGroup}
                  thing={thing}
                  group={group}
                  groupLabel={activeGroupLabel}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* ── OFFSET ── */}
      {showOffset && (
        <>
          <div className="px-2 py-1 bg-emperia-surface/60 border-y border-emperia-border/40">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-emperia-muted">Offset</span>
              <label className="flex items-center gap-1 cursor-pointer normal-case tracking-normal">
                <input
                  type="checkbox"
                  checked={thing.flags.hasDisplacement}
                  onChange={(e) => {
                    useOBStore.getState().updateThingFlags(thing.id, {
                      ...thing.flags,
                      hasDisplacement: e.target.checked,
                      displacementX: e.target.checked ? (thing.flags.displacementX ?? 0) : undefined,
                      displacementY: e.target.checked ? (thing.flags.displacementY ?? 0) : undefined,
                    });
                  }}
                  className="w-2.5 h-2.5 accent-emperia-accent"
                />
                <span className="text-[8px] text-emperia-muted">Enabled</span>
              </label>
            </div>
          </div>
          <div className={`px-3 py-2 grid grid-cols-2 gap-x-3 gap-y-1.5 ${thing.flags.hasDisplacement ? '' : 'opacity-45 pointer-events-none'}`}>
            <ParamField label="X" value={thing.flags.displacementX ?? 0} min={-512} max={512}
              onChange={(v) => {
                useOBStore.getState().updateThingFlags(thing.id, { ...thing.flags, hasDisplacement: true, displacementX: v });
              }}
            />
            <ParamField label="Y" value={thing.flags.displacementY ?? 0} min={-512} max={512}
              onChange={(v) => {
                useOBStore.getState().updateThingFlags(thing.id, { ...thing.flags, hasDisplacement: true, displacementY: v });
              }}
            />
          </div>
        </>
      )}

      {/* ── OUTFIT COLORS ── */}
      {showColors && (
        <>
          <div className="px-2 py-1 bg-emperia-surface/60 border-y border-emperia-border/40">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-emperia-muted">Colors</span>
          </div>
          <div className="px-3 py-2">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {(['primary', 'secondary'] as const).map((channel) => (
                <div key={channel} className="flex items-center gap-1">
                  <button
                    onClick={() => useOBStore.setState({ showColorPicker: showColorPicker === channel ? null : channel })}
                    className="w-4 h-4 rounded border border-emperia-border shrink-0"
                    style={{ backgroundColor: paletteToCSS(outfitColors[channel]) }}
                    title={`${COLOR_MASK_REGION_LABELS[channel]}: ${outfitColors[channel]}`}
                  />
                  <span className="text-emperia-muted text-[9px]">{COLOR_MASK_REGION_LABELS[channel]}</span>
                  <StepperBtn onClick={() => useOBStore.setState({ outfitColors: { ...outfitColors, [channel]: Math.max(0, outfitColors[channel] - 1) } })}>‹</StepperBtn>
                  <span className="text-emperia-text font-mono w-5 text-center text-[9px]">{outfitColors[channel]}</span>
                  <StepperBtn onClick={() => useOBStore.setState({ outfitColors: { ...outfitColors, [channel]: Math.min(PALETTE_SIZE - 1, outfitColors[channel] + 1) } })}>›</StepperBtn>
                </div>
              ))}
            </div>
            {showColorPicker && (
              <div className="mt-1 p-1 bg-emperia-surface border border-emperia-border rounded grid gap-px" style={{ gridTemplateColumns: 'repeat(19, 14px)' }}>
                {OUTFIT_PALETTE.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => { useOBStore.setState({ outfitColors: { ...outfitColors, [showColorPicker]: idx }, showColorPicker: null }); }}
                    className={`w-3.5 h-3.5 rounded-sm border ${outfitColors[showColorPicker] === idx ? 'border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: paletteToCSS(idx) }}
                    title={`${idx}`}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

    </div>
  );
}

function SetAllDurations({
  thing,
  group,
  groupLabel,
}: {
  thing: {
    id: number;
    rawBytes?: Uint8Array;
    frameGroups: { animationLengths: { min: number; max: number }[] }[];
  };
  group: { animationLengths: { min: number; max: number }[] };
  groupLabel: string;
}) {
  const [val, setVal] = useState(group.animationLengths[0]?.min ?? 100);

  const markDirty = () => {
    thing.rawBytes = undefined;
    const store = useOBStore.getState();
    const ids = new Set(store.dirtyIds);
    ids.add(thing.id);
    useOBStore.setState({ dirty: true, dirtyIds: ids, editVersion: store.editVersion + 1 });
  };

  const applyToGroups = (groups: typeof thing.frameGroups) => {
    for (const targetGroup of groups) {
      for (const duration of targetGroup.animationLengths) {
        duration.min = val;
        duration.max = val;
      }
    }
    markDirty();
  };

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-1 border-t border-emerald-500/10">
      <span className="text-[8px] text-emerald-400/70 shrink-0">Set all:</span>
      <input
        type="number"
        value={val}
        title={String(val)}
        min={0}
        max={MAX_ANIMATION_FRAME_DURATION_MS}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v)) {
            setVal(Math.max(0, Math.min(MAX_ANIMATION_FRAME_DURATION_MS, v)));
          }
        }}
        className="number-input-compact w-24 px-1 py-0.5 bg-emperia-surface border border-emperia-border rounded text-[9px] text-emperia-text font-mono tabular-nums text-center outline-none focus:border-emperia-accent"
      />
      <span className="text-[8px] text-emperia-muted">ms</span>
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => applyToGroups([group])}
          title={`Apply to every frame in ${groupLabel} only`}
          className="px-1.5 py-0.5 rounded text-[8px] bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/50 transition-colors"
        >
          Apply {groupLabel}
        </button>
        {thing.frameGroups.length > 1 && (
          <button
            onClick={() => applyToGroups(thing.frameGroups)}
            title="Apply to every frame in every animation group"
            className="px-1.5 py-0.5 rounded text-[8px] bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-emperia-text hover:border-emerald-500/30 transition-colors"
          >
            Apply All
          </button>
        )}
      </div>
    </div>
  );
}
