import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { Link2, Swords } from 'lucide-react';
import { useOBStore, getThingsForCategory, getDisplayId } from '../store';
import { compositeThingDataUrl } from '../lib/sprite-decoder';
import { poseSetProfileKey, type SeatDirection } from '../lib/types';
import { useSpriteTooltip } from './SpriteTooltip';
import { getSpriteIndex } from './ui-primitives';
import { readItemProperty } from '../lib/item-properties';

const VISIBLE_BUFFER = 20; // extra items to render above/below viewport
const EFFECT_ANIMATION_TICK_MS = 50;
const SEAT_DIRECTION_BITS: Array<{ direction: SeatDirection; bit: number }> = [
  { direction: 'north', bit: 1 },
  { direction: 'east', bit: 2 },
  { direction: 'south', bit: 4 },
  { direction: 'west', bit: 8 },
];

export function ThingGrid() {
  const objectData = useOBStore((s) => s.objectData);
  const activeCategory = useOBStore((s) => s.activeCategory);
  const activeLibrary = useOBStore((s) => s.activeLibrary);
  const searchQuery = useOBStore((s) => s.searchQuery);
  const getCategoryRange = useOBStore((s) => s.getCategoryRange);
  const selectedId = useOBStore((s) => s.selectedThingId);
  const setSelectedId = useOBStore((s) => s.setSelectedThingId);
  const selectedIds = useOBStore((s) => s.selectedThingIds);
  const toggleSelection = useOBStore((s) => s.toggleThingSelection);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const editVersion = useOBStore((s) => s.editVersion); // re-render on sprite replacement
  const filterGroup = useOBStore((s) => s.filterGroup);
  const equipmentFilter = useOBStore((s) => s.equipmentFilter);
  const marketSort = useOBStore((s) => s.marketSort);
  const cols = useOBStore((s) => s.libraryColumns);
  const itemDefinitions = useOBStore((s) => s.itemDefinitions);
  const appearanceToItemIds = useOBStore((s) => s.appearanceToItemIds);
  const itemLocalizations = useOBStore((s) => s.itemLocalizations);
  const hairDefinitions = useMemo(
    () => Array.from(objectData?.hairDefinitions.values() ?? []),
    [objectData, editVersion],
  );
  const beardDefinitions = useMemo(
    () => Array.from(objectData?.beardDefinitions.values() ?? []),
    [objectData, editVersion],
  );
  const setSelectedBeardId = useOBStore((s) => s.setSelectedBeardId);
  const equipmentLinksByAppearance = useMemo(() => {
    const links = new Map<number, number[]>();
    for (const [itemId, appearance] of objectData?.equipmentAppearances ?? []) {
      for (const appearanceId of [appearance.default, appearance.left, appearance.right]) {
        if (appearanceId == null) continue;
        const itemIds = links.get(appearanceId) ?? [];
        if (!itemIds.includes(itemId)) itemIds.push(itemId);
        links.set(appearanceId, itemIds);
      }
    }
    for (const itemIds of links.values()) itemIds.sort((left, right) => left - right);
    return links;
  }, [objectData]);
  const itemLinksByAppearance = useMemo(() => {
    const links = new Map<number, number[]>();
    for (const [itemId, appearanceId] of objectData?.itemAppearances ?? []) {
      const itemIds = links.get(appearanceId) ?? [];
      itemIds.push(itemId);
      links.set(appearanceId, itemIds);
    }
    for (const itemIds of links.values()) itemIds.sort((left, right) => left - right);
    return links;
  }, [objectData]);
  const setSelectedHairId = useOBStore((s) => s.setSelectedHairId);

  const tooltip = useSpriteTooltip(spriteData, spriteOverrides);

  const things = useMemo(() => {
    const filtered = getThingsForCategory(
      objectData,
      activeCategory,
      searchQuery,
      filterGroup,
      equipmentFilter,
      getCategoryRange,
      itemDefinitions,
      appearanceToItemIds,
      itemLocalizations,
      activeLibrary === 'market',
    );
    if (activeLibrary === 'attachments' || activeLibrary === 'equipment') {
      const attachmentAppearanceIds = new Set(
        Array.from(objectData?.visualEquipmentAppearances.values() ?? [])
          .filter(entry => entry.attachment && entry.equipmentAppearanceId > 0)
          .map(entry => entry.equipmentAppearanceId),
      );
      return filtered.filter(thing => attachmentAppearanceIds.has(getDisplayId(objectData!, thing.id))
        === (activeLibrary === 'attachments'));
    }
    if (activeLibrary !== 'market') return filtered;
    const marketItem = (thing: (typeof filtered)[number]) => {
      const itemId = appearanceToItemIds.get(thing.id);
      const definition = itemId != null ? itemDefinitions.get(itemId) : undefined;
      return { itemId: itemId ?? thing.id, definition };
    };
    const sorted = marketSort === 'id' ? filtered : filtered.sort((left, right) => {
      const leftItem = marketItem(left);
      const rightItem = marketItem(right);
      if (marketSort === 'group') {
        const groupOrder = (leftItem.definition?.group ?? -1) - (rightItem.definition?.group ?? -1);
        if (groupOrder !== 0) return groupOrder;
      } else {
        const leftName = itemLocalizations.en.get(leftItem.itemId)?.name
          ?? readItemProperty(leftItem.definition?.properties, 'name');
        const rightName = itemLocalizations.en.get(rightItem.itemId)?.name
          ?? readItemProperty(rightItem.definition?.properties, 'name');
        const nameOrder = String(leftName ?? '').localeCompare(String(rightName ?? ''));
        if (nameOrder !== 0) return nameOrder;
      }
      return leftItem.itemId - rightItem.itemId;
    });
    const visibleIds = new Set(sorted.map((thing) => thing.id));
    const pinnedIds = new Set(selectedIds);
    if (selectedId != null) pinnedIds.add(selectedId);
    const pinned = Array.from(pinnedIds)
      .filter((id) => !visibleIds.has(id))
      .map((id) => objectData?.things.get(id))
      .filter((thing): thing is NonNullable<typeof thing> => thing?.category === 'item')
      .sort((left, right) => left.id - right.id);
    return [...pinned, ...sorted];
  },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objectData, activeCategory, activeLibrary, selectedId, selectedIds, searchQuery, filterGroup, equipmentFilter, marketSort, getCategoryRange, itemDefinitions, appearanceToItemIds, itemLocalizations, editVersion],
  );

  useEffect(() => {
    if (activeLibrary !== 'market' || !objectData) return;
    if (selectedId == null || !things.some((thing) => thing.id === selectedId)) {
      setSelectedId(things[0]?.id ?? null);
    }
  }, [activeLibrary, objectData, selectedId, setSelectedId, things]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(240);
  const [effectAnimationElapsed, setEffectAnimationElapsed] = useState(0);

  useEffect(() => {
    if (activeCategory !== 'effect') {
      setEffectAnimationElapsed(0);
      return;
    }

    const startedAt = Date.now();
    setEffectAnimationElapsed(0);
    const timer = window.setInterval(() => {
      setEffectAnimationElapsed(Date.now() - startedAt);
    }, EFFECT_ANIMATION_TICK_MS);
    return () => window.clearInterval(timer);
  }, [activeCategory]);

  // Compute grid layout
  const cellSize = Math.max(40, Math.floor(containerWidth / cols));
  const totalRows = Math.ceil(things.length / cols);
  const totalHeight = totalRows * cellSize;

  // Visible range
  const startRow = Math.max(0, Math.floor(scrollTop / cellSize) - VISIBLE_BUFFER);
  const endRow = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / cellSize) + VISIBLE_BUFFER);
  const startIdx = startRow * cols;
  const endIdx = Math.min(things.length, endRow * cols);
  const visibleThings = things.slice(startIdx, endIdx);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      setContainerHeight(el.clientHeight);
      setContainerWidth(el.clientWidth);
    };
    const obs = new ResizeObserver(updateSize);
    obs.observe(el);
    updateSize();
    return () => obs.disconnect();
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!things.length || selectedId == null) return;
      // Don't capture when an input/textarea/select is focused
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const idx = things.findIndex((t) => t.id === selectedId);
      if (idx < 0) return;
      let next = idx;
      switch (e.key) {
        case 'ArrowRight': next = Math.min(things.length - 1, idx + 1); break;
        case 'ArrowLeft': next = Math.max(0, idx - 1); break;
        case 'ArrowDown': next = Math.min(things.length - 1, idx + cols); break;
        case 'ArrowUp': next = Math.max(0, idx - cols); break;
        default: return;
      }
      if (next !== idx) {
        e.preventDefault();
        setSelectedId(things[next].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [things, selectedId, setSelectedId]);

  // Auto-scroll to selected thing when it changes
  useEffect(() => {
    if (selectedId == null || !containerRef.current) return;
    const idx = things.findIndex((t) => t.id === selectedId);
    if (idx < 0) return;
    const row = Math.floor(idx / cols);
    const top = row * cellSize;
    const el = containerRef.current;
    if (top < el.scrollTop || top + cellSize > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 2 + cellSize / 2);
    }
  }, [selectedId, things, cols, cellSize]);

  return (<>
    <div
      id="object-library-grid"
      ref={containerRef}
      onScroll={handleScroll}
      tabIndex={-1}
      className="flex-1 overflow-y-auto focus:outline-none"
    >
      {activeLibrary === 'market' && things.length === 0 && (
        <p className="px-3 py-6 text-center text-xs text-emperia-muted">
          {itemDefinitions.size === 0
            ? 'Load item definitions to view Market items.'
            : 'No Market items match the current filters.'}
        </p>
      )}
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: startRow * cellSize,
            left: 0,
            right: 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
          }}
        >
          {visibleThings.map((thing) => {
            const previewGroup = thing.frameGroups[0];
            const previewWidth = previewGroup?.width || 1;
            const previewHeight = previewGroup?.height || 1;
            const previewTileCount = previewWidth * previewHeight;
            const facesSouth = (
              thing.category === 'outfit'
              || thing.category === 'equipment'
              || thing.category === 'hair'
              || thing.category === 'beard'
            ) && (previewGroup?.patternX ?? 0) > 2;
            const previewDirection = facesSouth ? 2 : 0;
            let previewFrame = 0;
            if (thing.category === 'effect' && previewGroup && previewGroup.animationLength > 1) {
              const frameDurations = Array.from(
                { length: previewGroup.animationLength },
                (_, frame) => Math.max(1, previewGroup.animationLengths[frame]?.min ?? 200),
              );
              const cycleDuration = frameDurations.reduce((total, duration) => total + duration, 0);
              let cyclePosition = effectAnimationElapsed % cycleDuration;
              for (let frame = 0; frame < frameDurations.length; frame++) {
                if (cyclePosition < frameDurations[frame]) {
                  previewFrame = frame;
                  break;
                }
                cyclePosition -= frameDurations[frame];
              }
            }
            const previewSprites = previewGroup
              ? Array.from({ length: previewTileCount }, (_, index) => {
                  const tileX = index % previewWidth;
                  const tileY = Math.floor(index / previewWidth);
                  return previewGroup.sprites[getSpriteIndex(
                    previewGroup,
                    previewFrame,
                    previewDirection,
                    0,
                    0,
                    0,
                    tileX,
                    tileY,
                  )] ?? 0;
                })
              : [];
            const url = spriteData && previewGroup
              ? compositeThingDataUrl(
                  spriteData,
                  thing.id,
                  previewWidth,
                  previewHeight,
                  previewSprites,
                  spriteOverrides,
                  thing.category === 'effect' && thing.flags.hasDisplacement
                    ? {
                        x: thing.flags.displacementX ?? 0,
                        y: thing.flags.displacementY ?? 0,
                      }
                    : undefined,
                )
              : null;
            const isSelected = thing.id === selectedId;
            const displayId = objectData ? getDisplayId(objectData, thing.id) : thing.id;
            const linkedEquipmentItemIds = thing.category === 'equipment'
              ? equipmentLinksByAppearance.get(displayId) ?? []
              : [];
            const equipmentIsLinked = linkedEquipmentItemIds.length > 0;
            const itemId = appearanceToItemIds?.get(thing.id);
            const publicItemIds = thing.category === 'item'
              ? itemLinksByAppearance.get(thing.id) ?? []
              : [];
            const def = itemId != null ? itemDefinitions?.get(itemId) : undefined;
            const itemName = itemId != null
              ? itemLocalizations.en.get(itemId)?.name ?? def?.properties?.name
              : def?.properties?.name;
            const publicId = activeCategory === 'item' ? (itemId ?? displayId) : displayId;
            const linkedEquipment = thing.category === 'item'
              ? objectData?.equipmentAppearances.get(publicId)
              : undefined;
            const linkedEquipmentAppearanceId = linkedEquipment?.default
              ?? linkedEquipment?.left
              ?? linkedEquipment?.right;
            const linkedEquipmentInternalId = linkedEquipmentAppearanceId == null || !objectData
              ? null
              : objectData.itemCount + objectData.outfitCount + 1 + linkedEquipmentAppearanceId;
            const seatBinding = activeCategory === 'item'
              ? objectData?.itemSeatDefinitions.get(publicId) ?? null
              : null;
            const boundPoseSet = seatBinding
              ? objectData?.poseSets.get(seatBinding.poseSetId) ?? null
              : null;
            const enabledPoseDirections = seatBinding
              ? SEAT_DIRECTION_BITS.filter(({ bit }) => (seatBinding.directionMask & bit) !== 0)
              : [];
            const missingPoseDirections = boundPoseSet && objectData
              ? enabledPoseDirections.filter(({ direction }) => !objectData.seatPoseProfiles.has(
                  poseSetProfileKey(boundPoseSet.id, direction),
                ))
              : enabledPoseDirections;
            const bindingComplete = Boolean(
              boundPoseSet
              && enabledPoseDirections.length > 0
              && missingPoseDirections.length === 0,
            );
            const aliasText = publicItemIds.length > 1
              ? ` · Public IDs: ${publicItemIds.map((id) => `#${id}`).join(', ')}`
              : '';
            const baseTipText = `${itemName ? `#${publicId} — ${itemName}` : `#${publicId}`}${aliasText}`;
            const tipText = seatBinding
              ? `${baseTipText} · Pose: ${boundPoseSet?.name ?? `missing #${seatBinding.poseSetId}`}`
              : thing.category === 'equipment'
                ? equipmentIsLinked
                  ? `${baseTipText} · Linked to item${linkedEquipmentItemIds.length > 1 ? 's' : ''} ${linkedEquipmentItemIds.map((id) => `#${id}`).join(', ')}`
                  : `${baseTipText} · Not linked to an item`
                : baseTipText;

            const isMultiSelected = selectedIds.has(thing.id);
            const selectThing = (ctrlKey = false, metaKey = false, shiftKey = false) => {
              if (ctrlKey || metaKey) {
                toggleSelection(thing.id);
              } else if (shiftKey && selectedId != null) {
                const startIdx = things.findIndex((candidate) => candidate.id === selectedId);
                const endIdx = things.findIndex((candidate) => candidate.id === thing.id);
                if (startIdx >= 0 && endIdx >= 0) {
                  const lo = Math.min(startIdx, endIdx);
                  const hi = Math.max(startIdx, endIdx);
                  const rangeIds = things.slice(lo, hi + 1).map((candidate) => candidate.id);
                  toggleSelection(thing.id, rangeIds);
                }
              } else {
                setSelectedId(thing.id);
                if (activeLibrary === 'hair' && objectData) {
                  const hair = hairDefinitions.find((entry) => entry.appearanceId === getDisplayId(objectData, thing.id));
                  if (hair) setSelectedHairId(hair.hairId);
                }
                if (activeLibrary === 'beard' && objectData) {
                  const beard = beardDefinitions.find((entry) => entry.appearanceId === getDisplayId(objectData, thing.id));
                  if (beard) setSelectedBeardId(beard.beardId);
                }
              }
            };
            return (
              <div
                key={thing.id}
                role="button"
                tabIndex={0}
                onClick={(event) => selectThing(event.ctrlKey, event.metaKey, event.shiftKey)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  selectThing(event.ctrlKey, event.metaKey, event.shiftKey);
                }}
                className={`
                  relative flex items-center justify-center
                  cursor-pointer border transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-emperia-accent
                  ${isSelected
                    ? 'bg-emperia-accent/20 border-emperia-accent'
                    : isMultiSelected
                      ? 'bg-emperia-accent/10 border-emperia-accent/50'
                      : 'border-transparent hover:bg-emperia-hover'
                  }
                `}
                style={{ width: cellSize, height: cellSize }}
                title={tipText}
                onMouseEnter={(e) => {
                  if (previewGroup && (previewWidth > 1 || previewHeight > 1)) {
                    tooltip.showThing(
                      thing.id,
                      { ...previewGroup, patternX: 1, sprites: previewSprites },
                      tipText,
                      e,
                    );
                  } else {
                    tooltip.show(previewSprites.find((spriteId) => spriteId > 0) ?? 0, tipText, e);
                  }
                }}
                onMouseMove={tooltip.move}
                onMouseLeave={tooltip.hide}
              >
                {url ? (
                  <img
                    src={url}
                    alt=""
                    className="pixelated"
                    style={{
                      imageRendering: 'pixelated',
                      width: Math.max(32, cellSize - 8),
                      height: Math.max(32, cellSize - 8),
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  <div
                    className="rounded-sm bg-emperia-border/30"
                    style={{
                      width: Math.max(32, cellSize - 8),
                      height: Math.max(32, cellSize - 8),
                    }}
                  />
                )}
                {seatBinding && (
                  <span
                    title={bindingComplete
                      ? `Bound to ${boundPoseSet?.name}`
                      : `Pose binding incomplete${missingPoseDirections.length > 0
                        ? `: ${missingPoseDirections.map(({ direction }) => direction).join(', ')}`
                        : ''}`}
                    className={`absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded border shadow-md shadow-black ${
                      bindingComplete
                        ? 'border-emerald-300/60 bg-emerald-600 text-white'
                        : 'border-amber-300/60 bg-amber-600 text-white'
                    }`}
                  >
                    <Link2 className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                )}
                {linkedEquipmentInternalId != null && objectData?.things.has(linkedEquipmentInternalId) && (
                  <button
                    type="button"
                    title={`Go to linked equipment #${linkedEquipmentAppearanceId}`}
                    aria-label={`Go to linked equipment #${linkedEquipmentAppearanceId}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      tooltip.hide();
                      useOBStore.setState({
                        activeCategory: 'equipment',
                        activeLibrary: 'equipment',
                        centerTab: 'equipment',
                        selectedThingId: linkedEquipmentInternalId,
                        selectedThingIds: new Set(),
                        searchQuery: '',
                        filterGroup: -1,
                        equipmentFilter: 'all',
                      });
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                    onMouseEnter={(event) => {
                      event.stopPropagation();
                      tooltip.hide();
                    }}
                    className="absolute bottom-1 left-1 flex h-4 w-4 items-center justify-center rounded border border-cyan-300/60 bg-cyan-700/90 text-white shadow-md shadow-black transition-colors hover:bg-cyan-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-200"
                  >
                    <Swords className="h-2.5 w-2.5" strokeWidth={2.5} />
                  </button>
                )}
                <span className={`absolute top-1 flex items-center gap-1 ${
                  thing.category === 'equipment' ? 'left-1' : 'right-1'
                }`}>
                  {thing.category === 'equipment' && (
                    <span
                      title={equipmentIsLinked
                        ? `Linked to item${linkedEquipmentItemIds.length > 1 ? 's' : ''} ${linkedEquipmentItemIds.map((id) => `#${id}`).join(', ')}`
                        : 'Not linked to an item'}
                      className={`h-2 w-2 shrink-0 rounded-full border border-black/70 shadow-sm shadow-black ${
                        equipmentIsLinked ? 'bg-emerald-400' : 'bg-red-500'
                      }`}
                    />
                  )}
                  <span
                    className="font-mono text-[8px] font-semibold leading-none text-white"
                    style={{ textShadow: '0 1px 2px #000, 0 0 2px #000' }}
                  >
                    {publicId}
                  </span>
                  {publicItemIds.length > 1 && (
                    <span
                      title={`Also linked: ${publicItemIds.filter((id) => id !== publicId).map((id) => `#${id}`).join(', ')}`}
                      className="rounded bg-amber-500/90 px-1 font-mono text-[7px] font-bold leading-3 text-black shadow-sm shadow-black"
                    >
                      +{publicItemIds.length - 1}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
    {tooltip.portal}
  </>);
}
