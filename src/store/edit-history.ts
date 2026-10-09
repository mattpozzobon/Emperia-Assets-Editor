import type { OBState, SpriteEditEntry } from './store-types';
import type { ThingType } from '../lib/types';
import { clearSpriteCache } from '../lib/sprite-decoder';

function cloneThing(thing: ThingType): ThingType {
  return structuredClone({ ...thing, rawBytes: undefined });
}

export function captureSpriteEdit(state: OBState, thingId: number) {
  const thing = state.objectData?.things.get(thingId);
  if (!thing) throw new Error('Cannot record an edit without an object');
  return { thingId, thing: cloneThing(thing), sprites: new Map(state.spriteOverrides), token: {} };
}

export function recordSpriteEdit(before: ReturnType<typeof captureSpriteEdit>, state: OBState): Partial<OBState> {
  const thing = state.objectData?.things.get(before.thingId);
  if (!thing) return {};
  const beforeSprites = new Map<number, ImageData | undefined>();
  const afterSprites = new Map<number, ImageData | undefined>();
  for (const id of new Set([...before.sprites.keys(), ...state.spriteOverrides.keys()])) {
    if (before.sprites.get(id) === state.spriteOverrides.get(id)) continue;
    beforeSprites.set(id, before.sprites.get(id));
    afterSprites.set(id, state.spriteOverrides.get(id));
  }
  const afterThing = cloneThing(thing);
  if (!beforeSprites.size && JSON.stringify(before.thing) === JSON.stringify(afterThing)) return {};
  const entry: SpriteEditEntry = {
    thingId: before.thingId, beforeThing: before.thing, afterThing,
    beforeSprites, afterSprites, token: before.token,
  };
  const top = state.undoStack[state.undoStack.length - 1];
  // Pointer moves update a single stroke entry, preserving its initial pixels.
  const stack = top && 'token' in top && top.token === before.token
    ? state.undoStack.slice(0, -1) : state.undoStack;
  return { undoStack: [...stack, entry], redoStack: [] };
}

export function restoreSpriteEdit(state: OBState, entry: SpriteEditEntry, redo: boolean): Partial<OBState> {
  state.objectData?.things.set(entry.thingId, cloneThing(redo ? entry.afterThing : entry.beforeThing));
  const spriteOverrides = new Map(state.spriteOverrides);
  const dirtySpriteIds = new Set(state.dirtySpriteIds);
  for (const [id, pixels] of redo ? entry.afterSprites : entry.beforeSprites) {
    if (pixels) spriteOverrides.set(id, pixels);
    else spriteOverrides.delete(id);
    // Keep IDs allocated: later imports must never reuse a redo entry's IDs.
    dirtySpriteIds.add(id);
  }
  const dirtyIds = new Set(state.dirtyIds);
  dirtyIds.add(entry.thingId);
  clearSpriteCache();
  return { spriteOverrides, dirtySpriteIds, dirtyIds, dirty: true, editVersion: state.editVersion + 1 };
}
