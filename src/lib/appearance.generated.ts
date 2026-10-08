// Generated from Emperia-Server/src/shared/appearance.ts.
/** One exclusive visual style. Colours are exact RGB; palette indices are UI/wire concerns. */
export type Appearance =
  | { readonly kind: "material"; readonly materialId: number; readonly composition?: number }
  | { readonly kind: "color"; readonly primary: number; readonly secondary?: number };
export const APPEARANCE_PALETTE: readonly number[] = [
  0xFFFFFF, 0xBFD4FF, 0xBFE9FF, 0xBFFFFF, 0xBFFFE9, 0xBFFFD4, 0xBFFFBF,
  0xD4FFBF, 0xE9FFBF, 0xFFFFBF, 0xFFE9BF, 0xFFD4BF, 0xFFBFBF, 0xFFBFD4,
  0xFFBFE9, 0xFFBFFF, 0xE9BFFF, 0xD4BFFF, 0xBFBFFF, 0xDADADA, 0x8F9FBF,
  0x8FAFBF, 0x8FBFBF, 0x8FBFAF, 0x8FBF9F, 0x8FBF8F, 0x9FBF8F, 0xAFBF8F,
  0xBFBF8F, 0xBFAF8F, 0xBF9F8F, 0xBF8F8F, 0xBF8F9F, 0xBF8FAF, 0xBF8FBF,
  0xAF8FBF, 0x9F8FBF, 0x8F8FBF, 0xB6B6B6, 0x5F7FBF, 0x8FAFBF, 0x5FBFBF,
  0x5FBF9F, 0x5FBF7F, 0x5FBF5F, 0x7FBF5F, 0x9FBF5F, 0xBFBF5F, 0xBF9F5F,
  0xBF7F5F, 0xBF5F5F, 0xBF5F7F, 0xBF5F9F, 0xBF5FBF, 0x9F5FBF, 0x7F5FBF,
  0x5F5FBF, 0x919191, 0x3F6ABF, 0x3F94BF, 0x3FBFBF, 0x3FBF94, 0x3FBF6A,
  0x3FBF3F, 0x6ABF3F, 0x94BF3F, 0xBFBF3F, 0xBF943F, 0xBF6A3F, 0xBF3F3F,
  0xBF3F6A, 0xBF3F94, 0xBF3FBF, 0x943FBF, 0x6A3FBF, 0x3F3FBF, 0x6D6D6D,
  0x0055FF, 0x00AAFF, 0x00FFFF, 0x00FFAA, 0x00FF54, 0x00FF00, 0x54FF00,
  0xAAFF00, 0xFFFF00, 0xFFA900, 0xFF5500, 0xFF0000, 0xFF0055, 0xFF00A9,
  0xFF00FE, 0xAA00FF, 0x5500FF, 0x0000FF, 0x484848, 0x003FBF, 0x007FBF,
  0x00BFBF, 0x00BF7F, 0x00BF3F, 0x00BF00, 0x3FBF00, 0x7FBF00, 0xBFBF00,
  0xBF7F00, 0xBF3F00, 0xBF0000, 0xBF003F, 0xBF007F, 0xBF00BF, 0x7F00BF,
  0x3F00BF, 0x0000BF, 0x242424, 0x002A7F, 0x00557F, 0x007F7F, 0x007F55,
  0x007F2A, 0x007F00, 0x2A7F00, 0x557F00, 0x7F7F00, 0x7F5400, 0x7F2A00,
  0x7F0000, 0x7F002A, 0x7F0054, 0x7F007F, 0x55007F, 0x2A007F, 0x00007F
];
export const colorOf = (appearance?: Appearance) => appearance?.kind === "color" ? appearance : undefined;
export const materialOf = (appearance?: Appearance) => appearance?.kind === "material" ? appearance : undefined;
export function colorAppearance(primary: number, secondary = primary): Appearance | undefined {
  if (primary === 0xFFFFFF && secondary === primary) return undefined;
  return secondary === primary ? { kind: "color", primary } : { kind: "color", primary, secondary };
}
export function materialAppearance(materialId: number, composition = 0): Appearance | undefined {
  return materialId > 0 ? { kind: "material", materialId, ...(composition ? { composition } : {}) } : undefined;
}
export function appearanceKey(appearance?: Appearance): string {
  return appearance?.kind === "material" ? `m:${appearance.materialId}:${appearance.composition ?? 0}`
    : appearance ? `c:${appearance.primary}:${appearance.secondary ?? appearance.primary}` : "-";
}
export function sameAppearance(a?: Appearance, b?: Appearance): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  return a.kind === "material" && b.kind === "material"
    ? a.materialId === b.materialId && (a.composition ?? 0) === (b.composition ?? 0)
    : a.kind === "color" && b.kind === "color" && a.primary === b.primary
      && (a.secondary ?? a.primary) === (b.secondary ?? b.primary);
}
const swap = (n: number) => ((n & 255) << 16) | (n & 0xFF00) | (n >>> 16);
export function paletteRgb(index: number, hair = false): number {
  const value = APPEARANCE_PALETTE[index] ?? 0xFFFFFF;
  return hair ? swap(value) : value;
}
export function paletteAppearance(primary: number, secondary = primary, hair = false): Appearance | undefined {
  return colorAppearance(paletteRgb(primary, hair), paletteRgb(secondary, hair));
}
const paletteIndices = new Map<number, number>();
APPEARANCE_PALETTE.forEach((rgb, index) => { if (!paletteIndices.has(rgb)) paletteIndices.set(rgb, index); });
export function paletteIndex(rgb: number, hair = false): number {
  return paletteIndices.get(hair ? swap(rgb) : rgb) ?? -1;
}
/** Used by palette pickers and compact palette wire encoding, never stored alongside RGB. */
export function paletteColors(appearance?: Appearance, hair = false): { primary: number; secondary: number } | undefined {
  const color = colorOf(appearance);
  if (!color) return undefined;
  return { primary: paletteIndex(color.primary, hair), secondary: paletteIndex(color.secondary ?? color.primary, hair) };
}
/** Boundary conversion for existing saved records. Explicit dye wins over material styling. */
export function legacyAppearance(value: { appearance?: Appearance; colors?: { primary: number; secondary: number }; maskPrimary?: number; maskSecondary?: number; materialId?: number; materialComposition?: number }, hair = false): Appearance | undefined {
  if (value.appearance) return value.appearance;
  const primary = value.maskPrimary || 0xFFFFFF;
  return colorAppearance(primary, value.maskSecondary ?? primary)
    ?? (value.colors ? paletteAppearance(value.colors.primary, value.colors.secondary, hair) : undefined)
    ?? materialAppearance(value.materialId ?? 0, value.materialComposition ?? 0);
}
