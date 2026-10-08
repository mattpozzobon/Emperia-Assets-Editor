import type { ObjectData, AttachmentCatalogEntry } from './types';

export function attachmentLibraryStart(data: ObjectData): number {
  return data.itemCount + data.outfitCount + data.equipmentCount + data.hairCount
    + data.effectCount + data.distanceCount + data.beardCount;
}

/** Only the three potion position sources are migrated; equipment #77 is untouched. */
export function migrateAttachmentLibrary(data: ObjectData): ObjectData {
  if ((data.attachmentCount ?? 0) > 0) return removeMigratedEquipmentSources(data);
  if (data.formatVersion >= 19) return data;
  if (![74, 75, 76].every(id => data.things.get(data.itemCount + data.outfitCount + 1 + id)?.category === 'equipment')) return data;
  const things = new Map(data.things);
  const visualEquipmentAppearances = new Map(data.visualEquipmentAppearances);
  const attachmentCatalog = new Map<number, AttachmentCatalogEntry>();
  const start = attachmentLibraryStart(data);
  for (const [index, equipmentId] of [74, 75, 76].entries()) {
    const source = things.get(data.itemCount + data.outfitCount + 1 + equipmentId);
    if (!source || source.category !== 'equipment') continue;
    const attachmentId = index + 1;
    things.set(start + attachmentId, {
      ...source, id: start + attachmentId, category: 'attachments',
      flags: { ...source.flags },
      frameGroups: source.frameGroups.map(group => ({ ...group, sprites: group.sprites.slice(),
        animationLengths: group.animationLengths?.map(length => ({ ...length })),
      })),
      colorMaskSources: source.colorMaskSources?.slice(),
      rawBytes: undefined,
    });
    attachmentCatalog.set(attachmentId, { attachmentId, name: `Belt Slot ${attachmentId}`,
      legacySourceEquipmentId: equipmentId,
      attachment: { point: (['belt1', 'belt2', 'belt3'] as const)[index], ranks: [0, 0, 0, 0] },
    });
    visualEquipmentAppearances.delete(800 + index);
  }
  const pouch = visualEquipmentAppearances.get(803);
  if (pouch) {
    const { attachment: _attachment, ...equipment } = pouch;
    visualEquipmentAppearances.set(803, { ...equipment,
      name: pouch.name === 'Belt Pouch' ? 'Visual Equipment 803' : pouch.name });
  }
  return removeMigratedEquipmentSources({ ...data, things, attachmentCount: attachmentCatalog.size, attachmentCatalog, visualEquipmentAppearances });
}

/** Finish both legacy migrations and v19 files saved with duplicated source records. */
function removeMigratedEquipmentSources(data: ObjectData): ObjectData {
  const sources = Array.from(data.attachmentCatalog?.values() ?? [])
    .map(entry => entry.legacySourceEquipmentId)
    .filter((id): id is number => id != null)
    .sort((a, b) => a - b);
  if (sources.length !== 3 || sources.some((id, index) => id !== 74 + index)) return data;
  const equipmentStart = data.itemCount + data.outfitCount + 1;
  if (!sources.every(id => data.things.get(equipmentStart + id)?.category === 'equipment')) return data;
  const removed = sources.map(id => equipmentStart + id);
  const things = new Map<number, import('./types').ThingType>();
  for (const [id, thing] of data.things) {
    if (removed.includes(id)) continue;
    const nextId = id - removed.filter(sourceId => sourceId < id).length;
    things.set(nextId, { ...thing, id: nextId, rawBytes: nextId === id ? thing.rawBytes : undefined });
  }
  const remap = (id: number | undefined): number | undefined => id == null || sources.includes(id)
    ? undefined : id - sources.filter(sourceId => sourceId < id).length;
  const equipmentAppearances = new Map<number, import('./types').EquipmentAppearance>();
  for (const [id, entry] of data.equipmentAppearances) {
    const next: import('./types').EquipmentAppearance = {};
    for (const variant of ['default', 'left', 'right'] as const) {
      const appearanceId = remap(entry[variant]);
      if (appearanceId != null) next[variant] = appearanceId;
    }
    if (Object.keys(next).length) equipmentAppearances.set(id, next);
  }
  const visualEquipmentAppearances = new Map<number, import('./types').VisualEquipmentAppearance>();
  for (const [id, entry] of data.visualEquipmentAppearances) {
    const appearanceId = remap(entry.equipmentAppearanceId);
    if (appearanceId != null) visualEquipmentAppearances.set(id, { ...entry, equipmentAppearanceId: appearanceId });
  }
  const attachmentCatalog = new Map<number, AttachmentCatalogEntry>();
  for (const [id, entry] of data.attachmentCatalog ?? []) {
    const { legacySourceEquipmentId: _source, ...next } = entry;
    attachmentCatalog.set(id, next);
  }
  return { ...data, things, equipmentCount: data.equipmentCount - sources.length,
    equipmentAppearances, visualEquipmentAppearances, attachmentCatalog };
}
