/**
 * Beard catalog actions. The EOBJ map is the only source of truth.
 */
import type { BeardDefinition } from '../lib/types';
import type { OBState } from './store-types';

type Set_ = (partial: Partial<OBState>) => void;
type Get_ = () => OBState;

function updateCatalog(
  set: Set_,
  get: Get_,
  mutate: (catalog: Map<number, BeardDefinition>) => void,
  selectedBeardId?: number | null,
) {
  const state = get();
  if (!state.objectData) return;
  const beardDefinitions = new Map(state.objectData.beardDefinitions);
  mutate(beardDefinitions);
  set({
    objectData: { ...state.objectData, beardDefinitions },
    ...(selectedBeardId !== undefined ? { selectedBeardId } : {}),
    dirty: true,
    editVersion: state.editVersion + 1,
  });
}

export function createBeardCatalogSlice(set: Set_, get: Get_) {
  return {
    addBeardDefinition: (beard: BeardDefinition) => {
      updateCatalog(set, get, (catalog) => catalog.set(beard.beardId, beard), beard.beardId);
    },
    updateBeardDefinition: (beardId: number, data: Partial<BeardDefinition>) => {
      const state = get();
      const selectedBeardId = data.beardId != null && state.selectedBeardId === beardId
        ? data.beardId
        : state.selectedBeardId;
      updateCatalog(set, get, (catalog) => {
        const current = catalog.get(beardId);
        if (!current) return;
        const updated = { ...current, ...data };
        catalog.delete(beardId);
        catalog.set(updated.beardId, updated);
      }, selectedBeardId);
    },
    removeBeardDefinition: (beardId: number) => {
      const state = get();
      const nextSelected = state.selectedBeardId === beardId
        ? Array.from(state.objectData?.beardDefinitions.keys() ?? []).find((id) => id !== beardId) ?? null
        : state.selectedBeardId;
      updateCatalog(set, get, (catalog) => catalog.delete(beardId), nextSelected);
    },
    duplicateBeardDefinition: (beardId: number) => {
      const state = get();
      const source = state.objectData?.beardDefinitions.get(beardId);
      if (!source) return;
      let newId = source.beardId + 1;
      while (state.objectData!.beardDefinitions.has(newId)) newId++;
      updateCatalog(
        set,
        get,
        (catalog) => catalog.set(newId, { ...source, beardId: newId, name: `${source.name} (copy)` }),
        newId,
      );
    },
    setSelectedBeardId: (id: number | null) => set({ selectedBeardId: id }),
  };
}

