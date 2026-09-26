import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, ArrowDownToLine, GripHorizontal } from 'lucide-react';
import { useOBStore } from '../store';
import { getSpriteDataUrl, clearSpriteCache } from '../lib/sprite-decoder';
import { getSpriteIndex } from './ui-primitives';
import type { SpriteGroup } from '../store/store-types';
import type { FrameGroup } from '../lib/types';

const TILE = 32;
const MIN_TRAY_HEIGHT = 120;
const DEFAULT_TRAY_HEIGHT = 260;
const MAX_TRAY_HEIGHT_RATIO = 0.75;
const MAX_ANIMATION_FRAMES = 255;

function GroupRow({ group, index, placed }: { group: SpriteGroup; index: number; placed: boolean }) {
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const removeSpriteGroup = useOBStore((s) => s.removeSpriteGroup);

  if (!spriteData) return null;

  const handleDragStart = (e: React.DragEvent) => {
    useOBStore.setState({ draggingSpriteGroupId: group.id });
    e.dataTransfer.setData('application/x-sprite-group', JSON.stringify(group));
    e.dataTransfer.setData('text/plain', `sprite-group:${group.id}`);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragEnd = () => {
    useOBStore.setState({ draggingSpriteGroupId: null });
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`group flex items-center gap-1.5 px-1.5 py-1 rounded border transition-colors cursor-grab active:cursor-grabbing
        ${placed
          ? 'border-green-500/40 bg-green-500/10'
          : 'border-emperia-border bg-emperia-surface hover:border-emperia-accent/50'
        }`}
      title={`${group.label} (${group.cols}×${group.rows}) — drag onto canvas to place`}
    >
      <span className={`text-[10px] font-mono w-4 text-right shrink-0 ${placed ? 'text-green-400' : 'text-emperia-muted'}`}>
        {index}
      </span>

      <div
        className="grid shrink-0 checkerboard rounded"
        style={{
          gridTemplateColumns: `repeat(${group.cols}, ${TILE}px)`,
          gap: 1,
        }}
      >
        {group.spriteIds.map((sid, i) => {
          const url = sid > 0 ? getSpriteDataUrl(spriteData, sid, spriteOverrides) : null;
          return (
            <div key={i} className="flex items-center justify-center" style={{ width: TILE, height: TILE }}>
              {url ? (
                <img src={url} alt="" draggable={false} className="w-8 h-8 pointer-events-none" style={{ imageRendering: 'pixelated' }} />
              ) : (
                <div className="w-8 h-8 bg-emperia-border/20 rounded-sm" />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <span className={`text-[9px] truncate ${placed ? 'text-green-300' : 'text-emperia-muted'}`}>
          {group.label}
        </span>
        <span className="text-[8px] text-emperia-muted/50">{group.cols}×{group.rows}</span>
      </div>

      {placed && (
        <span className="text-[8px] text-green-400 shrink-0">✓</span>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); removeSpriteGroup(group.id); }}
        className="p-0.5 rounded text-emperia-muted/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
        title="Remove group"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

/**
 * Place a sprite group's tiles into the correct frame group sprite slots.
 * Group spriteIds are row-major (top-left to bottom-right).
 * OTB tile coords are flipped: tx=width-1 is left, ty=height-1 is top.
 */
function placeGroupOnFrame(
  fg: FrameGroup,
  sg: SpriteGroup,
  frame: number,
  px: number,
  py: number,
): boolean {
  let placed = false;
  for (let row = 0; row < sg.rows; row++) {
    for (let col = 0; col < sg.cols; col++) {
      const sid = sg.spriteIds[row * sg.cols + col];
      if (sid <= 0) continue;

      const cellOffsetX = Math.floor(col / fg.width);
      const cellOffsetY = Math.floor(row / fg.height);
      const tileInCellCol = col % fg.width;
      const tileInCellRow = row % fg.height;

      const targetPx = px + cellOffsetX;
      const targetPy = py + cellOffsetY;
      if (targetPx >= fg.patternX || targetPy >= fg.patternY) continue;

      const tx = fg.width - 1 - tileInCellCol;
      const ty = fg.height - 1 - tileInCellRow;
      const idx = getSpriteIndex(fg, frame, targetPx, targetPy, 0, 0, tx, ty);
      if (idx >= 0 && idx < fg.sprites.length) {
        fg.sprites[idx] = sid;
        placed = true;
      }
    }
  }
  return placed;
}

/**
 * Resize a frame group without changing the meaning of its existing sprite slots.
 * A plain array resize is not enough because width, height and animation count are
 * all part of the flattened sprite index.
 */
function resizeFrameGroup(
  frameGroup: FrameGroup,
  width: number,
  height: number,
  animationLength: number,
) {
  const previous: FrameGroup = {
    ...frameGroup,
    animationLengths: frameGroup.animationLengths.map((length) => ({ ...length })),
    sprites: [...frameGroup.sprites],
  };

  frameGroup.width = width;
  frameGroup.height = height;
  frameGroup.exactSizeHint = Math.max(width, height);
  frameGroup.animationLength = animationLength;
  frameGroup.animationLengths = Array.from(
    { length: animationLength },
    (_, frame) => previous.animationLengths[frame] ?? { min: 100, max: 100 },
  );
  frameGroup.sprites = new Array(
    width * height * frameGroup.layers * frameGroup.patternX * frameGroup.patternY
      * frameGroup.patternZ * animationLength,
  ).fill(0);

  const framesToCopy = Math.min(previous.animationLength, animationLength);
  const widthToCopy = Math.min(previous.width, width);
  const heightToCopy = Math.min(previous.height, height);
  for (let frame = 0; frame < framesToCopy; frame++) {
    for (let patternZ = 0; patternZ < frameGroup.patternZ; patternZ++) {
      for (let patternY = 0; patternY < frameGroup.patternY; patternY++) {
        for (let patternX = 0; patternX < frameGroup.patternX; patternX++) {
          for (let layer = 0; layer < frameGroup.layers; layer++) {
            for (let tileY = 0; tileY < heightToCopy; tileY++) {
              for (let tileX = 0; tileX < widthToCopy; tileX++) {
                const previousIndex = getSpriteIndex(
                  previous,
                  frame,
                  patternX,
                  patternY,
                  patternZ,
                  layer,
                  tileX,
                  tileY,
                );
                const nextIndex = getSpriteIndex(
                  frameGroup,
                  frame,
                  patternX,
                  patternY,
                  patternZ,
                  layer,
                  tileX,
                  tileY,
                );
                frameGroup.sprites[nextIndex] = previous.sprites[previousIndex] ?? 0;
              }
            }
          }
        }
      }
    }
  }
}

function getEmptyFrames(frameGroup: FrameGroup, patternX: number, patternY: number) {
  return Array.from(
    { length: frameGroup.animationLength },
    (_, frame) => frame,
  ).filter((frame) => {
    for (let patternZ = 0; patternZ < frameGroup.patternZ; patternZ++) {
      for (let layer = 0; layer < frameGroup.layers; layer++) {
        for (let tileY = 0; tileY < frameGroup.height; tileY++) {
          for (let tileX = 0; tileX < frameGroup.width; tileX++) {
            const index = getSpriteIndex(
              frameGroup,
              frame,
              patternX,
              patternY,
              patternZ,
              layer,
              tileX,
              tileY,
            );
            if (frameGroup.sprites[index] > 0) return false;
          }
        }
      }
    }
    return true;
  });
}

export function SpriteGroupTray() {
  const spriteGroups = useOBStore((s) => s.spriteGroups);
  const clearSpriteGroups = useOBStore((s) => s.clearSpriteGroups);
  const selectedId = useOBStore((s) => s.selectedThingId);
  const objectData = useOBStore((s) => s.objectData);
  const editVersion = useOBStore((s) => s.editVersion);
  const activeGroup = useOBStore((s) => s.activeGroup);
  const activeDirection = useOBStore((s) => s.activeDirection);
  const activePatternY = useOBStore((s) => s.activePatternY);
  const [trayHeight, setTrayHeight] = useState(DEFAULT_TRAY_HEIGHT);
  const resizeStartRef = useRef<{ y: number; height: number } | null>(null);

  const thing = selectedId != null ? objectData?.things.get(selectedId) ?? null : null;
  const frameGroup = thing?.frameGroups[activeGroup] ?? null;
  const targetPatternX = frameGroup
    ? Math.max(0, Math.min(activeDirection, frameGroup.patternX - 1))
    : 0;
  const targetPatternY = frameGroup
    ? Math.max(0, Math.min(activePatternY, frameGroup.patternY - 1))
    : 0;

  // Collect sprite IDs used in the pattern/direction currently shown in preview.
  const usedSpriteIds = useMemo(() => {
    const used = new Set<number>();
    if (!frameGroup) return used;
    for (let frame = 0; frame < frameGroup.animationLength; frame++) {
      for (let patternZ = 0; patternZ < frameGroup.patternZ; patternZ++) {
        for (let layer = 0; layer < frameGroup.layers; layer++) {
          for (let tileY = 0; tileY < frameGroup.height; tileY++) {
            for (let tileX = 0; tileX < frameGroup.width; tileX++) {
              const index = getSpriteIndex(
                frameGroup,
                frame,
                targetPatternX,
                targetPatternY,
                patternZ,
                layer,
                tileX,
                tileY,
              );
              const spriteId = frameGroup.sprites[index];
              if (spriteId > 0) used.add(spriteId);
            }
          }
        }
      }
    }
    return used;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameGroup, targetPatternX, targetPatternY, editVersion]);

  // Determine which groups have ALL their non-zero sprites placed on the current thing
  const placedSet = useMemo(() => {
    const set = new Set<number>();
    for (const g of spriteGroups) {
      const nonZero = g.spriteIds.filter(s => s > 0);
      if (nonZero.length > 0 && nonZero.every(s => usedSpriteIds.has(s))) {
        set.add(g.id);
      }
    }
    return set;
  }, [spriteGroups, usedSpriteIds]);

  // Fill all unplaced groups into sequential animation frames. When every
  // pending group has the same dimensions, infer the object size from them.
  const handleFillFrames = useCallback(() => {
    if (!thing || !frameGroup) return;

    const unplaced = spriteGroups.filter(g => !placedSet.has(g.id));
    if (unplaced.length === 0) return;

    let anyPlaced = false;
    const firstGroup = unplaced[0];
    const hasUniformDimensions = unplaced.every(
      (group) => group.cols === firstGroup.cols && group.rows === firstGroup.rows,
    );

    const inferredWidth = hasUniformDimensions ? firstGroup.cols : frameGroup.width;
    const inferredHeight = hasUniformDimensions ? firstGroup.rows : frameGroup.height;
    if (inferredWidth !== frameGroup.width || inferredHeight !== frameGroup.height) {
      resizeFrameGroup(
        frameGroup,
        inferredWidth,
        inferredHeight,
        frameGroup.animationLength,
      );
    }

    let emptyFrames = getEmptyFrames(frameGroup, targetPatternX, targetPatternY);
    const missingFrameCount = Math.max(0, unplaced.length - emptyFrames.length);
    if (missingFrameCount > 0 && frameGroup.animationLength < MAX_ANIMATION_FRAMES) {
      const nextAnimationLength = Math.min(
        MAX_ANIMATION_FRAMES,
        frameGroup.animationLength + missingFrameCount,
      );
      resizeFrameGroup(frameGroup, frameGroup.width, frameGroup.height, nextAnimationLength);
      emptyFrames = getEmptyFrames(frameGroup, targetPatternX, targetPatternY);
    }

    for (let i = 0; i < unplaced.length && i < emptyFrames.length; i++) {
      if (placeGroupOnFrame(
        frameGroup,
        unplaced[i],
        emptyFrames[i],
        targetPatternX,
        targetPatternY,
      )) {
        anyPlaced = true;
      }
    }

    if (anyPlaced) {
      thing.rawBytes = undefined;
      clearSpriteCache();
      const store = useOBStore.getState();
      const newDirtyIds = new Set(store.dirtyIds);
      newDirtyIds.add(thing.id);
      useOBStore.setState({ dirty: true, dirtyIds: newDirtyIds, editVersion: store.editVersion + 1 });
    }
  }, [thing, frameGroup, spriteGroups, placedSet, targetPatternX, targetPatternY]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const maxHeight = Math.max(MIN_TRAY_HEIGHT, Math.floor(window.innerHeight * MAX_TRAY_HEIGHT_RATIO));
      const nextHeight = start.height + (start.y - e.clientY);
      setTrayHeight(Math.min(maxHeight, Math.max(MIN_TRAY_HEIGHT, nextHeight)));
    };
    const handlePointerUp = () => {
      resizeStartRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);

  if (spriteGroups.length === 0) return null;

  const unplacedCount = spriteGroups.length - placedSet.size;

  return (
    <div className="border-t border-emperia-border shrink-0 flex flex-col" style={{ height: trayHeight }}>
      <div
        className="h-2 -mt-px flex items-center justify-center cursor-ns-resize text-emperia-muted/40 hover:text-emperia-accent hover:bg-emperia-hover/60 transition-colors"
        onPointerDown={(e) => {
          resizeStartRef.current = { y: e.clientY, height: trayHeight };
          document.body.style.cursor = 'ns-resize';
          document.body.style.userSelect = 'none';
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        title="Drag to resize sprite groups"
      >
        <GripHorizontal className="w-4 h-4" />
      </div>
      <div className="px-2 py-1 flex items-center justify-between">
        <span className="text-[10px] font-medium text-emperia-text uppercase tracking-wider">
          Sprite Groups
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-emperia-muted">
            {placedSet.size}/{spriteGroups.length}
          </span>
          {unplacedCount > 0 && thing && (
            <button
              onClick={handleFillFrames}
              className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium bg-emperia-accent/10 text-emperia-accent hover:bg-emperia-accent/20 transition-colors"
              title={`Place ${unplacedCount} unplaced group(s) into sequential animation frames`}
            >
              <ArrowDownToLine className="w-3 h-3" />
              Fill Frames
            </button>
          )}
          <button
            onClick={clearSpriteGroups}
            className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
            title="Clear all sprite groups"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="px-1.5 pb-1.5 overflow-y-auto min-h-0 flex-1 flex flex-col gap-1">
        {spriteGroups.map((group, i) => (
          <GroupRow key={group.id} group={group} index={i + 1} placed={placedSet.has(group.id)} />
        ))}
      </div>
    </div>
  );
}
