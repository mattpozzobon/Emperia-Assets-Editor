// Generated from Emperia-Server/src/shared/attachments.ts.
import { type Appearance, sameAppearance, appearanceKey } from './appearance.generated';

/** Stable wire positions. Codes are independent of attachment asset IDs. */
const NAMED_POINTS = ['belt1', 'belt2', 'belt3', 'beltPouch', 'backpackLeft', 'backpackRight', 'backpackBottom'] as const;
export type AttachmentPoint = typeof NAMED_POINTS[number] | `belt${number}` | `backpack${number}`;
export const ATTACHMENT_POINTS: readonly AttachmentPoint[] = Object.freeze([
  ...NAMED_POINTS,
  ...Array.from({ length: 124 }, (_, index) => `belt${index + 4}` as AttachmentPoint),
  ...Array.from({ length: 124 }, (_, index) => `backpack${index + 1}` as AttachmentPoint),
]);
export const MAX_ATTACHMENTS = ATTACHMENT_POINTS.length;
const POINT_CODES = new Map(ATTACHMENT_POINTS.map((point, index) => [point, index + 1]));
export function attachmentPointCode(point: AttachmentPoint): number { return POINT_CODES.get(point) ?? 0; }
export interface Attachment { attachmentId: number; appearance?: Appearance }
export type OutfitAttachments = Partial<Record<AttachmentPoint, Attachment>>;
export type AttachmentUpdates = Partial<Record<AttachmentPoint, Attachment | null>>;
export interface AttachmentDefinition { point: AttachmentPoint; ranks: [number, number, number, number] }
export interface ItemAttachmentBinding {
  point: AttachmentPoint;
  attachmentId: number;
  /** Optional zero-based physical potion slot; absent means a static attachment. */
  potionSlot?: number;
  appearance?: Appearance;
}
// Positional artwork for the four default potion slots.
export const BELT_POTION_VISUAL_IDS = [1, 4, 3, 2] as const;
export const DEFAULT_BELT_BINDINGS: readonly ItemAttachmentBinding[] = Object.freeze(BELT_POTION_VISUAL_IDS.map((attachmentId, index) => Object.freeze({ attachmentId, point: `belt${index + 1}` as AttachmentPoint, potionSlot: index })));
export function validateAttachmentDefinition(value: AttachmentDefinition): void {
  if (!attachmentPointCode(value.point) || value.ranks.length !== 4 || value.ranks.some(rank => !Number.isInteger(rank) || rank < 0 || rank > 15)) throw new Error('Invalid attachment point or directional draw ranks');
}
export function validateItemAttachmentBindings(value: unknown): asserts value is ItemAttachmentBinding[] {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) throw new Error('Invalid item attachment bindings');
  const points = new Set<AttachmentPoint>();
  for (const binding of value) {
    if (!binding || !attachmentPointCode(binding.point) || points.has(binding.point)
      || !Number.isInteger(binding.attachmentId) || binding.attachmentId < 1 || binding.attachmentId > 65535
      || (binding.potionSlot !== undefined && (!Number.isInteger(binding.potionSlot) || binding.potionSlot < 0 || binding.potionSlot > 126 || !binding.point.startsWith('belt')))) throw new Error('Invalid or duplicate item attachment binding');
    points.add(binding.point);
  }
}
/** Only active entries are visited. Collections are replaced when appearance changes. */
export function attachmentEntries(value: OutfitAttachments): Array<[AttachmentPoint, Attachment]> {
  return (Object.keys(value) as AttachmentPoint[]).filter(point => value[point] != null)
    .sort((a, b) => attachmentPointCode(a) - attachmentPointCode(b)).map(point => [point, value[point]!]);
}
export function hasAttachments(value: OutfitAttachments): boolean {
  for (const point in value) if (value[point as AttachmentPoint]) return true;
  return false;
}
/** Copy canonical records without accepting flags or equipment IDs. */
export function cloneAttachments(value?: OutfitAttachments): OutfitAttachments {
  const result: OutfitAttachments = {};
  if (!value) return result;
  for (const key of Object.keys(value)) {
    const point = key as AttachmentPoint;
    const entry = value[point];
    if (!attachmentPointCode(point) || !entry || !Number.isInteger(entry.attachmentId) || entry.attachmentId < 1 || entry.attachmentId > 65535) throw new Error(`Invalid attachment at ${point}`);
    result[point] = { attachmentId: entry.attachmentId, ...(entry.appearance ? { appearance: { ...entry.appearance } } : {}) };
  }
  return result;
}
export function sameAttachment(a: Attachment | undefined | null, b: Attachment | undefined | null): boolean {
  return a?.attachmentId === b?.attachmentId && sameAppearance(a?.appearance, b?.appearance);
}
export function sameAttachments(a: OutfitAttachments, b: OutfitAttachments): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a) as AttachmentPoint[], bKeys = Object.keys(b);
  return aKeys.length === bKeys.length && aKeys.every(point => sameAttachment(a[point], b[point]));
}
export function attachmentChanges(previous: OutfitAttachments, next: OutfitAttachments): Array<[AttachmentPoint, Attachment | null]> {
  const changes: Array<[AttachmentPoint, Attachment | null]> = [];
  for (const key of Object.keys(previous) as AttachmentPoint[]) if (!sameAttachment(previous[key], next[key])) changes.push([key, next[key] ?? null]);
  for (const key of Object.keys(next) as AttachmentPoint[]) if (!previous[key] && next[key]) changes.push([key, next[key]!]);
  return changes.sort((a, b) => attachmentPointCode(a[0]) - attachmentPointCode(b[0]));
}
export function applyAttachmentUpdates(current: OutfitAttachments, updates: AttachmentUpdates): OutfitAttachments {
  const next = { ...current };
  for (const point of Object.keys(updates) as AttachmentPoint[]) {
    const value = updates[point];
    if (value == null) delete next[point]; else next[point] = value;
  }
  return next;
}
export function attachmentsKey(value: OutfitAttachments): string {
  return attachmentEntries(value).map(([point, attachment]) => `${point}:${attachment.attachmentId}:${appearanceKey(attachment.appearance)}`).join('|');
}
