// Generated from Emperia-Server/src/shared/attachments.ts.
import { type Appearance, colorAppearance, sameAppearance, appearanceKey } from './appearance.generated';

/** Stable wire order. Slots are physical positions, never potion categories. */
export const ATTACHMENT_POINTS = ['belt1', 'belt2', 'belt3', 'beltPouch', 'backpackLeft', 'backpackRight', 'backpackBottom'] as const;
export type AttachmentPoint = typeof ATTACHMENT_POINTS[number];
export const ATTACHMENT_POINT_MASK = (1 << ATTACHMENT_POINTS.length) - 1;
export function attachmentMask(value: OutfitAttachments): number {
  let mask = 0;
  for (let index = 0; index < ATTACHMENT_POINTS.length; index++) if (value[ATTACHMENT_POINTS[index]]) mask |= 1 << index;
  return mask;
}
export interface Attachment { visualEquipmentId: number; appearance?: Appearance }
export type OutfitAttachments = Partial<Record<AttachmentPoint, Attachment>>;
export interface AttachmentDefinition {
  point: AttachmentPoint;
  /** Draw ranks for north/east/south/west, matching the creature layer ranks. */
  ranks: [number, number, number, number];
}
export const BELT_POTION_VISUAL_IDS = [800, 801, 802] as const;
export const POTION_ATTACHMENT_COLORS = Object.freeze({ health: 0xFF0000, mana: 0x0000FF, stamina: 0x00FF00 });
export function defaultAttachmentDefinition(visualId: number): AttachmentDefinition | undefined {
  const index = BELT_POTION_VISUAL_IDS.indexOf(visualId as 800);
  if (index >= 0) return { point: ATTACHMENT_POINTS[index], ranks: [0, 0, 0, 0] };
  if (visualId === 803) return { point: 'beltPouch', ranks: [3, 4, 1, 3] };
  return undefined;
}
export function validateAttachmentDefinition(value: AttachmentDefinition): void {
  if (!ATTACHMENT_POINTS.includes(value.point) || value.ranks.length !== 4
    || value.ranks.some(rank => !Number.isInteger(rank) || rank < 0 || rank > 15)) {
    throw new Error('Invalid attachment point or directional draw ranks');
  }
}
/** Historical authored outfits keep their visuals; players derive theirs from inventory. */
export function normalizeAttachments(value: OutfitAttachments | Record<string, unknown> | undefined): OutfitAttachments {
  if (!value) return {};
  const result: OutfitAttachments = {};
  for (const point of ATTACHMENT_POINTS) {
    const attachment = value[point];
    if (attachment && typeof attachment === 'object' && 'visualEquipmentId' in attachment) {
      const entry = attachment as Attachment;
      result[point] = { ...entry, ...(entry.appearance ? { appearance: { ...entry.appearance } } : {}) };
    }
  }
  for (const [legacy, point, visualEquipmentId, primary] of [
    ['healthPotion', 'belt1', 800, POTION_ATTACHMENT_COLORS.health],
    ['manaPotion', 'belt2', 801, POTION_ATTACHMENT_COLORS.mana],
    ['energyPotion', 'belt3', 802, POTION_ATTACHMENT_COLORS.stamina],
    ['bag', 'beltPouch', 803, undefined],
  ] as const) {
    if ((value as Record<string, unknown>)[legacy] && !result[point]) result[point] = { visualEquipmentId, appearance: primary === undefined ? undefined : colorAppearance(primary) };
  }
  return result;
}
export function sameAttachments(a: OutfitAttachments, b: OutfitAttachments): boolean {
  return ATTACHMENT_POINTS.every(point => a[point]?.visualEquipmentId === b[point]?.visualEquipmentId
    && sameAppearance(a[point]?.appearance, b[point]?.appearance));
}
export function attachmentsKey(value: OutfitAttachments): string {
  return ATTACHMENT_POINTS.map(point => `${point}:${value[point]?.visualEquipmentId ?? 0}:${appearanceKey(value[point]?.appearance)}`).join('|');
}
