import { ATTACHMENT_POINTS, validateAttachmentDefinition } from './attachments.generated';
/**
 * Compiles ObjectData back to .eobj binary format.
 * Inverse of object-parser.ts — writes Emperia header + flags + frame groups.
 */
import PacketWriter from './packet-writer';
import { EMPERIA_MAGIC, EmperiaFileType, EOBJ_FORMAT_VERSION } from './emperia-format';
import type { ObjectData, ThingFlags, FrameGroup, EquipmentAppearance, HairDefinition, BeardDefinition, ItemSeatDefinition } from './types';
import { encodeItemSlotType } from './item-slot-types';
import { encodeItemIdentity } from './item-identity-codec';

const ATTR = {
  ThingAttrGround: 0,
  ThingAttrGroundBorder: 1,
  ThingAttrOnBottom: 2,
  ThingAttrOnTop: 3,
  ThingAttrContainer: 4,
  ThingAttrStackable: 5,
  ThingAttrForceUse: 6,
  ThingAttrMultiUse: 7,
  ThingAttrWritable: 8,
  ThingAttrWritableOnce: 9,
  ThingAttrFluidContainer: 10,
  ThingAttrSplash: 11,
  ThingAttrNotWalkable: 12,
  ThingAttrNotMoveable: 13,
  ThingAttrBlockProjectile: 14,
  ThingAttrNotPathable: 15,
  ThingAttrPickupable: 16,
  ThingAttrHangable: 17,
  ThingAttrHookSouth: 18,
  ThingAttrHookEast: 19,
  ThingAttrRotateable: 20,
  ThingAttrLight: 21,
  ThingAttrTranslucent: 23,
  ThingAttrDisplacement: 24,
  ThingAttrElevation: 25,
  ThingAttrAnimateAlways: 27,
  ThingAttrMinimapColor: 28,
  ThingAttrRenderBelowCreatures: 102,
  ThingAttrLast: 255,
} as const;

function writeFlags(w: PacketWriter, flags: ThingFlags, version: number): void {
  // Write each flag in the canonical attribute order.
  // Version 1000+ reserves raw attribute 16, so later canonical attributes
  // are serialized one position higher.

  const writeAttr = (attr: number) => {
    if (version >= 1000) {
      // Inverse of parser's mapVersionFlag for v >= 1000:
      //   parser: raw 16 → 253, raw > 16 → raw - 1
      //   writer: canonical 253 → raw 16, canonical >= 16 → raw canonical + 1
      if (attr >= 16) { w.writeUInt8(attr + 1); return; }
    }
    w.writeUInt8(attr);
  };

  if (flags.ground) {
    writeAttr(ATTR.ThingAttrGround);
    w.writeUInt16(flags.groundSpeed ?? 0);
  }
  if (flags.groundBorder) writeAttr(ATTR.ThingAttrGroundBorder);
  if (flags.onBottom) writeAttr(ATTR.ThingAttrOnBottom);
  if (flags.onTop) writeAttr(ATTR.ThingAttrOnTop);
  if (flags.container) writeAttr(ATTR.ThingAttrContainer);
  if (flags.stackable) writeAttr(ATTR.ThingAttrStackable);
  if (flags.forceUse) writeAttr(ATTR.ThingAttrForceUse);
  if (flags.multiUse) writeAttr(ATTR.ThingAttrMultiUse);
  if (flags.writable) {
    writeAttr(ATTR.ThingAttrWritable);
    w.writeUInt16(0);
  }
  if (flags.writableOnce) {
    writeAttr(ATTR.ThingAttrWritableOnce);
    w.writeUInt16(0);
  }
  if (flags.fluidContainer) writeAttr(ATTR.ThingAttrFluidContainer);
  if (flags.splash) writeAttr(ATTR.ThingAttrSplash);
  if (flags.notWalkable) writeAttr(ATTR.ThingAttrNotWalkable);
  if (flags.notMoveable) writeAttr(ATTR.ThingAttrNotMoveable);
  if (flags.blockProjectile) writeAttr(ATTR.ThingAttrBlockProjectile);
  if (flags.notPathable) writeAttr(ATTR.ThingAttrNotPathable);
  if (flags.pickupable) writeAttr(ATTR.ThingAttrPickupable);
  if (flags.hangable) writeAttr(ATTR.ThingAttrHangable);
  if (flags.hookSouth) writeAttr(ATTR.ThingAttrHookSouth);
  if (flags.hookEast) writeAttr(ATTR.ThingAttrHookEast);
  if (flags.rotateable) writeAttr(ATTR.ThingAttrRotateable);
  if (flags.hasLight) {
    writeAttr(ATTR.ThingAttrLight);
    w.writeUInt16(flags.lightLevel ?? 0);
    w.writeUInt16(flags.lightColor ?? 0);
  }
  if (flags.translucent) writeAttr(ATTR.ThingAttrTranslucent);
  if (flags.hasDisplacement) {
    writeAttr(ATTR.ThingAttrDisplacement);
    if (version >= 755) {
      w.writeUInt16((flags.displacementX ?? 0) & 0xFFFF);
      w.writeUInt16((flags.displacementY ?? 0) & 0xFFFF);
    }
  }
  if (flags.hasElevation) {
    writeAttr(ATTR.ThingAttrElevation);
    w.writeUInt16(flags.elevation ?? 0);
  }
  if (flags.animateAlways) writeAttr(ATTR.ThingAttrAnimateAlways);
  if (flags.hasMinimapColor) {
    writeAttr(ATTR.ThingAttrMinimapColor);
    w.writeUInt16(flags.minimapColor ?? 0);
  }
  if (flags.renderBelowCreatures) writeAttr(ATTR.ThingAttrRenderBelowCreatures);

  // Terminator
  w.writeUInt8(ATTR.ThingAttrLast);
}

function writeFrameGroup(w: PacketWriter, fg: FrameGroup, version: number, writeGroupType: boolean): void {
  if (writeGroupType) w.writeUInt8(fg.type);

  w.writeUInt8(fg.width);
  w.writeUInt8(fg.height);

  if (fg.width > 1 || fg.height > 1) {
    w.writeUInt8(fg.exactSizeHint ?? Math.max(fg.width, fg.height));
  }

  w.writeUInt8(fg.layers);
  w.writeUInt8(fg.patternX);
  w.writeUInt8(fg.patternY);
  if (version >= 755) w.writeUInt8(fg.patternZ);
  w.writeUInt8(fg.animationLength);

  if (fg.animationLength > 1 && version >= 1050) {
    w.writeUInt8(fg.asynchronous);
    w.writeUInt32(fg.nLoop);
    w.writeUInt8(fg.start & 0xFF); // writeInt8 via writeUInt8
    for (let i = 0; i < fg.animationLength; i++) {
      const al = fg.animationLengths[i] ?? { min: 100, max: 100 };
      w.writeUInt32(al.min);
      w.writeUInt32(al.max);
    }
  }

  for (const spriteId of fg.sprites) {
    if (version >= 960) w.writeUInt32(spriteId);
    else w.writeUInt16(spriteId);
  }
}

export function compileObjectData(
  data: ObjectData,
  dirtyIds: Set<number> = new Set(),
  itemAppearances: Map<number, number> = data.itemAppearances,
  itemSlotTypes: Map<number, string> = data.itemSlotTypes,
  itemIdentities: Map<number, string> = data.itemIdentities,
  equipmentAppearances: Map<number, EquipmentAppearance> = data.equipmentAppearances,
  hairDefinitions: Map<number, HairDefinition> = data.hairDefinitions,
  itemSeatDefinitions: Map<number, ItemSeatDefinition> = data.itemSeatDefinitions,
  beardDefinitions: Map<number, BeardDefinition> = data.beardDefinitions ?? new Map(),
): ArrayBuffer {
  const w = new PacketWriter(1024 * 1024); // 1MB initial

  // Copy the original 20-byte Emperia header, then write current counts
  // (counts may have changed if things were added/removed)
  // Ensure feature flags byte (offset 0x0F) is correct — previous Assets Editor builds
  // wrote 0x00 which breaks legacy OB parsing (wrong extended/transparency).
  const isExtended = data.version >= 960;
  const isTransparent = data.version >= 960;
  const hasFrameGroups = data.version >= 1050;
  const hasFrameDurations = data.version >= 1050;
  let hdrFlags = 0;
  if (isExtended)       hdrFlags |= 0x01;
  if (isTransparent)    hdrFlags |= 0x02;
  if (hasFrameGroups)   hdrFlags |= 0x04;
  if (hasFrameDurations) hdrFlags |= 0x08;
  w.writeBytes(EMPERIA_MAGIC);
  w.writeUInt8(EmperiaFileType.OBJECT_DEFS);
  w.writeUInt16(EOBJ_FORMAT_VERSION);
  w.writeUInt32(data.version);
  w.writeUInt8(hdrFlags);
  w.writeUInt32(0);
  w.writeUInt16(data.itemCount);
  w.writeUInt16(data.outfitCount);
  w.writeUInt16(data.equipmentCount);
  w.writeUInt16(data.hairCount);
  w.writeUInt16(data.effectCount);
  w.writeUInt16(data.distanceCount);
  w.writeUInt16(data.beardCount ?? 0);
  w.writeUInt16(data.attachmentCount ?? 0);

  const mappings = Array.from(itemAppearances.entries()).sort(([a], [b]) => a - b);
  w.writeUInt32(mappings.length);
  for (const [itemId, appearanceId] of mappings) {
    if (!Number.isInteger(itemId) || itemId <= 0 || itemId > 0xFFFF) {
      throw new Error(`Public item ID ${itemId} is outside the UInt16 protocol range`);
    }
    if (!Number.isInteger(appearanceId) || appearanceId < 100 || appearanceId > data.itemCount) {
      throw new Error(`Item ${itemId} references invalid EOBJ appearance ${appearanceId}`);
    }
    w.writeUInt16(itemId);
    w.writeUInt16(appearanceId);
  }

  const outfitMappings = Array.from(data.outfitAppearances.entries()).sort(([a], [b]) => a - b);
  w.writeUInt32(outfitMappings.length);
  for (const [outfitId, appearanceId] of outfitMappings) {
    if (!Number.isInteger(outfitId) || outfitId <= 0 || outfitId > 0xFFFF) {
      throw new Error(`Public outfit ID ${outfitId} is outside the UInt16 protocol range`);
    }
    if (!Number.isInteger(appearanceId) || appearanceId < 0 || appearanceId >= data.outfitCount) {
      throw new Error(`Outfit ${outfitId} references invalid local appearance ${appearanceId}`);
    }
    w.writeUInt16(outfitId);
    w.writeUInt16(appearanceId);
  }

  const slotTypes = Array.from(itemSlotTypes.entries()).sort(([a], [b]) => a - b);
  w.writeUInt32(slotTypes.length);
  for (const [itemId, slotType] of slotTypes) {
    if (!Number.isInteger(itemId) || itemId <= 0 || itemId > 0xFFFF) {
      throw new Error(`Item slot metadata ID ${itemId} is outside the UInt16 protocol range`);
    }
    w.writeUInt16(itemId);
    w.writeUInt8(encodeItemSlotType(slotType));
  }

  const identities = Array.from(itemIdentities.entries()).sort(([a], [b]) => a - b);
  w.writeUInt32(identities.length);
  for (const [itemId, identity] of identities) {
    if (!Number.isInteger(itemId) || itemId <= 0 || itemId > 0xFFFF) {
      throw new Error(`Item identity metadata ID ${itemId} is outside the UInt16 protocol range`);
    }
    w.writeUInt16(itemId);
    w.writeUInt8(encodeItemIdentity(identity));
  }

  const materialMasks = Array.from(data.things.values())
    .filter((thing) => thing.materialMaskLayer != null)
    .sort((a, b) => a.id - b.id);
  if (materialMasks.length > 0xFFFF) throw new Error('Material mask catalog exceeds the UInt16 entry limit');
  w.writeUInt16(materialMasks.length);
  for (const thing of materialMasks) {
    const appearanceId = thing.id;
    const layer = thing.materialMaskLayer!;
    if (!Number.isInteger(appearanceId) || appearanceId < 100 || appearanceId > 0xFFFF) {
      throw new Error(`Material mask appearance ${appearanceId} is outside the UInt16 range`);
    }
    if (layer !== 1) {
      throw new Error(`Material mask appearance ${appearanceId} must use the shared layer 2`);
    }
    if (thing.frameGroups.some((group) => layer >= group.layers)) {
      throw new Error(`Material mask appearance ${appearanceId} references missing layer ${layer + 1}`);
    }
    w.writeUInt16(appearanceId);
  }

  const colorMasks = Array.from(data.things.values()).filter(thing => thing.colorMaskSources != null).sort((a, b) => a.id - b.id);
  if (colorMasks.length > 65535) throw new Error('Too many color masks');
  w.writeUInt16(colorMasks.length);
  for (const thing of colorMasks) {
    const sources = thing.colorMaskSources!;
    if (!Number.isInteger(thing.id) || thing.id < 100 || thing.id > 65535 || !thing.frameGroups.some(group => group.layers > 1) || thing.materialMaskLayer != null || sources.length < 1 || sources.length > 2 || new Set(sources).size !== sources.length || sources.some((source, index) => source !== index)) throw new Error(`Invalid color regions for appearance ${thing.id}`);
    w.writeUInt16(thing.id);
    w.writeUInt8(sources.length);
    for (const source of sources) w.writeUInt8(source);
  }

  const equipment = Array.from(equipmentAppearances.entries()).sort(([a], [b]) => a - b);
  w.writeUInt32(equipment.length);
  for (const [itemId, appearance] of equipment) {
    if (!Number.isInteger(itemId) || itemId <= 0 || itemId > 0xFFFF) {
      throw new Error(`Equipment item ID ${itemId} is outside the UInt16 protocol range`);
    }
    let mask = 0;
    if (appearance.default != null) mask |= 0x01;
    if (appearance.left != null) mask |= 0x02;
    if (appearance.right != null) mask |= 0x04;
    if (mask === 0) throw new Error(`Equipment item ${itemId} has no worn appearance`);
    w.writeUInt16(itemId);
    w.writeUInt8(mask);
    if (appearance.default != null) {
      if (appearance.default < 0 || appearance.default >= data.equipmentCount) throw new Error(`Equipment item ${itemId} references invalid appearance ${appearance.default}`);
      w.writeUInt16(appearance.default);
    }
    if (appearance.left != null) {
      if (appearance.left < 0 || appearance.left >= data.equipmentCount) throw new Error(`Equipment item ${itemId} references invalid left appearance ${appearance.left}`);
      w.writeUInt16(appearance.left);
    }
    if (appearance.right != null) {
      if (appearance.right < 0 || appearance.right >= data.equipmentCount) throw new Error(`Equipment item ${itemId} references invalid right appearance ${appearance.right}`);
      w.writeUInt16(appearance.right);
    }
  }

  const visualEquipment = Array.from(data.visualEquipmentAppearances.values())
    .sort((a, b) => a.visualEquipmentId - b.visualEquipmentId);
  if (visualEquipment.length > 0xFFFF) throw new Error('Visual equipment catalog exceeds the UInt16 entry limit');
  w.writeUInt16(visualEquipment.length);
  for (const visual of visualEquipment) {
    if (!Number.isInteger(visual.visualEquipmentId) || visual.visualEquipmentId <= 0 || visual.visualEquipmentId > 0xFFFF) {
      throw new Error(`Visual equipment ID ${visual.visualEquipmentId} is outside the UInt16 protocol range`);
    }
    if (!Number.isInteger(visual.equipmentAppearanceId) || visual.equipmentAppearanceId < 0 || visual.equipmentAppearanceId >= data.equipmentCount) {
      throw new Error(`Visual equipment ${visual.visualEquipmentId} references invalid appearance ${visual.equipmentAppearanceId}`);
    }
    w.writeUInt16(visual.visualEquipmentId);
    w.writeUInt16(visual.equipmentAppearanceId);
    w.writeString(visual.name);
    const attachment = visual.attachment;
    w.writeUInt8(attachment ? ATTACHMENT_POINTS.indexOf(attachment.point) + 1 : 0);
    if (attachment) {
      validateAttachmentDefinition(attachment);
      for (const rank of attachment.ranks) w.writeUInt8(rank);
    }
  }

  const hairs = Array.from(hairDefinitions.values()).sort((a, b) => a.hairId - b.hairId);
  if (hairs.length > 0xFFFF) throw new Error('Hair catalog exceeds the UInt16 entry limit');
  w.writeUInt16(hairs.length);
  for (const hair of hairs) {
    w.writeUInt16(hair.hairId);
    if (hair.appearanceId < 0 || hair.appearanceId >= data.hairCount) {
      throw new Error(`Hair ${hair.hairId} references invalid appearance ${hair.appearanceId}`);
    }
    w.writeUInt16(hair.appearanceId);
    w.writeUInt8(hair.races);
    w.writeUInt8(hair.genders);
    w.writeUInt8(hair.tiers);
    w.writeUInt16(hair.sortOrder);
    w.writeString(hair.name);
  }

  const beards = Array.from(beardDefinitions.values()).sort((a, b) => a.beardId - b.beardId);
  if (beards.length > 0xFFFF) throw new Error('Beard catalog exceeds the UInt16 entry limit');
  w.writeUInt16(beards.length);
  for (const beard of beards) {
    if (!Number.isInteger(beard.beardId) || beard.beardId < 1 || beard.beardId > 0xFFFF
      || !Number.isInteger(beard.appearanceId) || beard.appearanceId < 0 || beard.appearanceId >= (data.beardCount ?? 0)) {
      throw new Error(`Beard ${beard.beardId} references an invalid appearance`);
    }
    w.writeUInt16(beard.beardId);
    w.writeUInt16(beard.appearanceId);
    w.writeUInt8(beard.races);
    w.writeUInt8(beard.genders);
    w.writeUInt8(beard.tiers);
    w.writeUInt16(beard.sortOrder);
    w.writeString(beard.name);
  }

  const seats = Array.from(itemSeatDefinitions.entries()).sort(([a], [b]) => a - b);
  if (seats.length > 0xFFFF) throw new Error('Seat metadata exceeds the UInt16 entry limit');
  w.writeUInt16(seats.length);
  for (const [itemId, seat] of seats) {
    if (!Number.isInteger(itemId) || itemId <= 0 || itemId > 0xFFFF) {
      throw new Error(`Seat item ID ${itemId} is outside the UInt16 protocol range`);
    }
    if (seat.poseSetId !== 0 && !data.poseSets.has(seat.poseSetId)) {
      throw new Error(`Seat item ${itemId} references missing Pose Set ${seat.poseSetId}`);
    }
    w.writeUInt16(itemId);
    w.writeUInt16(seat.poseSetId);
    w.writeUInt8(seat.directionMask & 0x0F);
    for (const direction of ['north', 'east', 'south', 'west'] as const) {
      const offset = seat.offsets[direction] ?? { x: 0, y: 0 };
      w.writeInt16(offset.x);
      w.writeInt16(offset.y);
    }
  }

  const profiles = Array.from(data.seatPoseProfiles.values())
    .sort((a, b) =>
      `${a.poseSetId ?? 0}:${a.direction}`
        .localeCompare(`${b.poseSetId ?? 0}:${b.direction}`)
    );
  const poseSets = Array.from(data.poseSets.values()).sort((a, b) => a.id - b.id);
  for (const poseSet of poseSets) {
    if (!Number.isInteger(poseSet.id) || poseSet.id <= 0 || poseSet.id > 0xFFFF) {
      throw new Error(`Pose Set ID ${poseSet.id} is outside the UInt16 protocol range`);
    }
  }
  for (const profile of profiles) {
    if (profile.poseSetId == null || !data.poseSets.has(profile.poseSetId)) {
      throw new Error(`Pose profile ${profile.direction} references a missing Pose Set`);
    }
  }
  w.writeString(JSON.stringify({ poseSets, profiles }));

  for (let attachmentId = 1; attachmentId <= (data.attachmentCount ?? 0); attachmentId++) {
    const entry = data.attachmentCatalog?.get(attachmentId);
    if (!entry) throw new Error(`Missing attachment catalog entry ${attachmentId}`);
    validateAttachmentDefinition(entry.attachment);
    w.writeString(entry.name);
    w.writeUInt16(0xFFFF); // Reserved metadata word.
    w.writeUInt8(ATTACHMENT_POINTS.indexOf(entry.attachment.point) + 1);
    for (const rank of entry.attachment.ranks) w.writeUInt8(rank);
  }

  const totalCount = data.itemCount + data.outfitCount + data.equipmentCount
    + data.hairCount + data.effectCount + data.distanceCount + (data.beardCount ?? 0) + (data.attachmentCount ?? 0);

  for (let id = 100; id <= totalCount; id++) {
    const thing = data.things.get(id);
    if (!thing) {
      // Write empty flags + minimal frame group for missing entries
      w.writeUInt8(ATTR.ThingAttrLast);
      w.writeUInt8(1); w.writeUInt8(1); // 1x1
      w.writeUInt8(1); // layers
      w.writeUInt8(1); // patternX
      w.writeUInt8(1); // patternY
      if (data.version >= 755) w.writeUInt8(1); // patternZ
      w.writeUInt8(1); // animationLength
      if (data.version >= 960) w.writeUInt32(0); else w.writeUInt16(0);
      continue;
    }

    // Use raw bytes for unedited things (lossless round-trip)
    if (thing.rawBytes && !dirtyIds.has(id)) {
      w.writeBytes(thing.rawBytes);
      continue;
    }

    // Re-serialize from parsed data for edited things
    writeFlags(w, thing.flags, data.version);

    const isLayeredAppearance = thing.category === 'outfit' || thing.category === 'equipment' || thing.category === 'hair' || thing.category === 'beard' || thing.category === 'attachments';
    const hasFrameGroups = data.version >= 1050 && isLayeredAppearance;

    if (hasFrameGroups) {
      w.writeUInt8(thing.frameGroups.length);
    }

    for (const fg of thing.frameGroups) {
      writeFrameGroup(w, fg, data.version, hasFrameGroups);
    }
  }

  return w.toArrayBuffer();
}
