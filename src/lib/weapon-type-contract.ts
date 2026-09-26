/** Canonical weapon contract shared by editor encoding and form controls. */
export const WEAPON_TYPES = [
  '',
  'sword',
  'axe',
  'club',
  'bow',
  'crossbow',
  'short_bow',
  'orb',
  'shield',
  'staff',
  'wand',
] as const;

export type WeaponTypeName = typeof WEAPON_TYPES[number];

export const AMMO_TYPES = ['', 'arrow', 'bolt'] as const;
export type AmmoTypeName = typeof AMMO_TYPES[number];

export const ORB_DAMAGE_ELEMENTS = [
  '',
  'fire',
  'earth',
  'water',
  'wind',
  'ice',
  'death',
  'arcane',
  'holy',
] as const;
