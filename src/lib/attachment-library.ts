import type { ObjectData, AttachmentCatalogEntry } from './types';

export function attachmentLibraryStart(data: ObjectData): number {
  return data.itemCount + data.outfitCount + data.equipmentCount + data.hairCount
    + data.effectCount + data.distanceCount + data.beardCount;
}

/** Only the three potion position sources are migrated; equipment #77 is untouched. */
export function migrateAttachmentLibrary(data: ObjectData): ObjectData {
  if ((data.attachmentCount ?? 0) > 0) return restoreEquipmentIndices(data);
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
  return restoreEquipmentIndices({ ...data, things, attachmentCount: attachmentCatalog.size, attachmentCatalog, visualEquipmentAppearances });
}

/** Preserve public Equipment indices: moved potion sources become transparent tombstones. */
function restoreEquipmentIndices(data: ObjectData): ObjectData {
  const sources = [74, 75, 76];
  const entries = sources.map((_, index) => data.attachmentCatalog?.get(index + 1));
  if (!entries.every((entry, index) => entry?.attachment.point === `belt${index + 1}`)) return data;
  const marked = entries.every((entry, index) => entry?.legacySourceEquipmentId === sources[index]);
  // The defective shipped v19 migration compacted the original 186 records to 183
  // and cleared source metadata. Restrict repair to that known layout.
  const compacted = !marked && data.formatVersion === 19 && data.equipmentCount === 183
    && entries.every(entry => entry?.legacySourceEquipmentId == null);
  if (!marked && !compacted) return data;
  const equipmentStart = data.itemCount + data.outfitCount + 1;
  if (marked && sources.every(id => data.things.get(equipmentStart + id)?.frameGroups.every(group => group.sprites.every(sprite => sprite === 0)))) return data;
  const things = new Map<number, import('./types').ThingType>();
  for (const [id, thing] of data.things) {
    const nextId = compacted && id >= equipmentStart + 74 ? id + 3 : id;
    things.set(nextId, { ...thing, id: nextId, rawBytes: nextId === id ? thing.rawBytes : undefined });
  }
  for (const equipmentId of sources) {
    const id = equipmentStart + equipmentId;
    const template = things.get(attachmentLibraryStart(data) + (compacted ? 3 : 0) + equipmentId - 73)!;
    things.set(id, { id, category: 'equipment',
      flags: Object.fromEntries(Object.entries(template.flags).filter(([, value]) => typeof value === 'boolean').map(([key]) => [key, false])) as unknown as import('./types').ThingFlags,
      frameGroups: template.frameGroups.map(group => ({ ...group, sprites: group.sprites.map(() => 0),
        animationLengths: group.animationLengths?.map(length => ({ ...length })) })),
    });
  }
  const remap = (id: number | undefined): number | undefined => id == null ? undefined
    : compacted && id >= 74 ? id + 3 : id;
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
    attachmentCatalog.set(id, id <= 3 ? { ...entry, legacySourceEquipmentId: sources[id - 1] } : entry);
  }
  return { ...data, things, equipmentCount: data.equipmentCount + (compacted ? 3 : 0),
    equipmentAppearances, visualEquipmentAppearances, attachmentCatalog };
}
