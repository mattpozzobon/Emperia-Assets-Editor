import { defaultAttachmentDefinition, validateAttachmentDefinition } from '../lib/attachments.generated';
import type { VisualEquipmentAppearance } from '../lib/types';
/**
 * Equipment catalog actions. The EOBJ map is the only source of truth.
 */
import type { EquipmentAppearance, EquipmentCatalogEntry } from '../lib/types';
import type { OBState } from './store-types';

type Set_ = (partial: Partial<OBState>) => void;
type Get_ = () => OBState;
type Variant = keyof EquipmentAppearance;

function variantOf(entry: EquipmentCatalogEntry): Variant {
  const name = entry.name.toLowerCase();
  if (name.includes('left-hand') || name.includes('left hand') || name.includes('lefthand')) return 'left';
  if (name.includes('right-hand') || name.includes('right hand') || name.includes('righthand')) return 'right';
  return 'default';
}

function mutateCatalog(
  set: Set_,
  get: Get_,
  mutate: (catalog: Map<number, EquipmentAppearance>) => void,
) {
  const state = get();
  if (!state.objectData) return;
  const equipmentAppearances = new Map(state.objectData.equipmentAppearances);
  mutate(equipmentAppearances);
  set({
    objectData: { ...state.objectData, equipmentAppearances },
    dirty: true,
    editVersion: state.editVersion + 1,
  });
}

function removeVariant(catalog: Map<number, EquipmentAppearance>, entry: EquipmentCatalogEntry) {
  const current = catalog.get(entry.itemId);
  if (!current) return;
  const next = { ...current };
  delete next[variantOf(entry)];
  if (next.default == null && next.left == null && next.right == null) catalog.delete(entry.itemId);
  else catalog.set(entry.itemId, next);
}

function addVariant(catalog: Map<number, EquipmentAppearance>, entry: EquipmentCatalogEntry) {
  catalog.set(entry.itemId, {
    ...(catalog.get(entry.itemId) ?? {}),
    [variantOf(entry)]: entry.equipmentAppearanceId,
  });
}

export function createEquipmentCatalogSlice(set: Set_, get: Get_) {
  return {
    updateAttachmentCatalogEntry: (entry: VisualEquipmentAppearance) => {
      const state = get();
      if (!state.objectData || !entry.attachment) return;
      validateAttachmentDefinition(entry.attachment);
      if (!Number.isInteger(entry.visualEquipmentId) || entry.visualEquipmentId < 1 || entry.visualEquipmentId > 65535) throw new Error('Invalid visual ID');
      if (!Number.isInteger(entry.equipmentAppearanceId) || entry.equipmentAppearanceId < 0 || entry.equipmentAppearanceId >= state.objectData.equipmentCount) throw new Error('Sprite is outside the equipment library');
      const reserved = defaultAttachmentDefinition(entry.visualEquipmentId);
      if (reserved && reserved.point !== entry.attachment.point) throw new Error('Existing belt visual IDs keep their physical point');
      if ([...state.objectData.visualEquipmentAppearances.values()].some(value => value.visualEquipmentId !== entry.visualEquipmentId && value.attachment?.point === entry.attachment!.point)) throw new Error('This attachment point already has a visual');
      const visualEquipmentAppearances = new Map(state.objectData.visualEquipmentAppearances);
      visualEquipmentAppearances.set(entry.visualEquipmentId, { ...entry, attachment: { ...entry.attachment, ranks: [...entry.attachment.ranks] } });
      set({ objectData: { ...state.objectData, visualEquipmentAppearances }, dirty: true, editVersion: state.editVersion + 1 });
    },
    removeAttachmentCatalogEntry: (visualEquipmentId: number) => {
      if (defaultAttachmentDefinition(visualEquipmentId)) return;
      const state = get();
      if (!state.objectData?.visualEquipmentAppearances.get(visualEquipmentId)?.attachment) return;
      const visualEquipmentAppearances = new Map(state.objectData.visualEquipmentAppearances);
      visualEquipmentAppearances.delete(visualEquipmentId);
      set({ objectData: { ...state.objectData, visualEquipmentAppearances }, dirty: true, editVersion: state.editVersion + 1 });
    },
    updateEquipmentCatalogEntry: (previous: EquipmentCatalogEntry, entry: EquipmentCatalogEntry) => {
      mutateCatalog(set, get, (catalog) => {
        removeVariant(catalog, previous);
        addVariant(catalog, entry);
      });
    },
    addEquipmentCatalogEntry: (entry: EquipmentCatalogEntry) => {
      mutateCatalog(set, get, (catalog) => addVariant(catalog, entry));
    },
    removeEquipmentCatalogEntry: (entry: EquipmentCatalogEntry) => {
      mutateCatalog(set, get, (catalog) => removeVariant(catalog, entry));
    },
    assignVisualEquipmentToItem: (
      visualEquipmentId: number,
      itemId: number,
      variant: Variant,
    ) => {
      const state = get();
      if (!state.objectData) return;
      const visual = state.objectData.visualEquipmentAppearances.get(visualEquipmentId);
      if (!visual || visual.attachment) return;

      const equipmentAppearances = new Map(state.objectData.equipmentAppearances);
      equipmentAppearances.set(itemId, {
        ...(equipmentAppearances.get(itemId) ?? {}),
        [variant]: visual.equipmentAppearanceId,
      });

      const visualEquipmentAppearances = new Map(state.objectData.visualEquipmentAppearances);
      visualEquipmentAppearances.delete(visualEquipmentId);

      set({
        objectData: {
          ...state.objectData,
          equipmentAppearances,
          visualEquipmentAppearances,
        },
        dirty: true,
        editVersion: state.editVersion + 1,
      });
    },
  };
}
