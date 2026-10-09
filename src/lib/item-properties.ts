import type { ExclusiveSlotDef, ItemProperties } from './types';
import { validateItemAttachmentBindings } from './attachments.generated';
import {
  EXCLUSIVE_SLOT_CATEGORY_CODE_BY_TYPE,
  EXCLUSIVE_SLOT_TYPE_BY_CATEGORY_CODE,
  ITEM_CATEGORY_CODE_BY_TYPE,
  ITEM_SLOT_TYPES,
  type ItemSlotType,
} from './item-slot-types';
import { AMMO_TYPES, ORB_DAMAGE_ELEMENTS, WEAPON_TYPES } from './weapon-type-contract';

export const ITEM_PROPERTY_CODE_BY_KEY: Readonly<Record<string, number>> = {
  name: 1,
  article: 2,
  description: 3,
  type: 4,
  weaponType: 10,
  slotType: 11,
  ammoType: 12,
  shootType: 13,
  itemType: 14,
  damageElement: 15,
  physicalAttack: 20,
  magicalAttack: 21,
  physicalDefense: 22,
  magicalDefense: 23,
  armor: 26,
  // 27-29 are reserved retired combat attributes. Physical Hit uses 186.
  range: 30,
  level: 40,
  expertise: 41,
  skillSword: 50,
  skillAxe: 51,
  skillClub: 52,
  skillDist: 53,
  skillShield: 54,
  skillFist: 55,
  magiclevelpoints: 56,
  absorbPercentPhysical: 70,
  absorbPercentFire: 71,
  absorbPercentIce: 72,
  absorbPercentEnergy: 73,
  absorbPercentEarth: 74,
  absorbPercentDeath: 75,
  absorbPercentHoly: 76,
  containerSize: 90,
  containerSizePotions: 91,
  weightReduction: 92,
  healthGain: 100,
  healthTicks: 101,
  manaGain: 102,
  manaTicks: 103,
  speed: 110,
  friction: 111,
  floorchange: 112,
  charges: 120,
  showcharges: 121,
  showduration: 122,
  duration: 123,
  decayTo: 124,
  destroyTo: 125,
  transformEquipTo: 130,
  transformDeEquipTo: 131,
  rotateTo: 132,
  exclusiveSlots: 144,
  fluidSource: 147,
  field: 149,
  readable: 150,
  writeable: 151,
  weight: 160,
  maxTextLen: 165,
  writeOnceItemId: 166,
  bonusStrength: 170,
  bonusDexterity: 171,
  bonusEndurance: 172,
  bonusAgility: 173,
  bonusIntelligence: 174,
  bonusWisdom: 175,
  bonusFocus: 176,
  bonusSpirit: 177,
  bonusCritChance: 180,
  bonusCritDamage: 181,
  bonusDodge: 182,
  bonusCDR: 183,
  bonusHealingPower: 184,
  bonusAttackSpeed: 185,
  bonusPhysicalHit: 186,
  bonusSpellHit: 187,
  bonusMaxHealth: 188,
  bonusMaxMana: 189,
  bonusCapacity: 190,
  bonusHealthRegen: 191,
  bonusManaRegen: 192,
  bonusMaxStamina: 193,
  bonusStaminaRegen: 194,
  maxUses: 200,
  uses: 201,
  bonusStatusResist: 249,
  harvestType: 270,
  harvestResultItemId: 271,
  harvestQuantityMin: 272,
  harvestQuantityMax: 273,
  harvestTier: 274,
  harvestRequiredMasteryLevel: 275,
  harvestRequiredToolType: 276,
  harvestRequiredToolTier: 277,
  harvestToolUseCost: 278,
  harvestBaseChanceBps: 279,
  harvestChancePerLevelBps: 280,
  harvestMaxChanceBps: 281,
  harvestAttemptXp: 282,
  harvestSuccessXp: 283,
  harvestBonusYieldPerLevelBps: 284,
  harvestBonusYieldMaxBps: 285,
  harvestSizeMultiplierBps: 286,
  harvestMode: 287,
  harvestTransformItemId: 288,
  harvestRespawnSeconds: 289,
  toolTier: 290,
  marketable: 291,
  autoLootable: 292,
  mannequin: 293,
  mannequinDirection: 294,
  attachmentBindings: 295,
};

const SLOT_TYPES = [
  '', 'head', 'body', 'legs', 'feet', 'left-hand', 'right-hand',
  'hand', 'two-handed', 'ring', 'necklace', 'backpack', 'belt', 'ammo',
  'quiver', 'torch', 'pet', 'cape', 'mask',
] as const;
const FLOOR_CHANGES = [
  '', 'north', 'east', 'south', 'west', 'down', 'southalt', 'eastalt',
] as const;
/** Stable numeric order shared with the server FieldType contract. */
export const ITEM_FIELD_TYPES = [
  '', 'fire', 'poison', 'energy', 'trap', 'water', 'earth', 'wind',
] as const;
const FLUID_SOURCES: readonly (string | undefined)[] = [
  '', 'water', 'blood', 'beer', 'slime', 'lemonade',
  undefined, undefined, undefined, undefined, undefined, undefined, undefined,
  undefined, undefined, 'wine', undefined, undefined, undefined, 'mud',
  undefined, undefined, undefined, undefined, undefined, undefined, 'lava',
  'rum',
];
const EDITOR_ITEM_CATEGORY_CODE_BY_TYPE = Object.freeze({
  ...ITEM_CATEGORY_CODE_BY_TYPE,
  // Food is both an exclusive-slot category and an assignable item category.
  // Reuse the shared protocol code so itemType round-trips as numeric value 23.
  food: EXCLUSIVE_SLOT_CATEGORY_CODE_BY_TYPE.food,
  // Editor-owned market taxonomy. These codes intentionally follow the
  // protocol-owned category range so they remain stable in items.json.
  wood: 33,
  metal: 34,
  cloth: 35,
  leather: 36,
  alchemy: 37,
});
const itemCategories: Array<string | undefined> = [];
itemCategories[0] = '';
for (const [type, code] of Object.entries(EDITOR_ITEM_CATEGORY_CODE_BY_TYPE)) {
  itemCategories[code] = type;
}
const ITEM_CATEGORIES: readonly (string | undefined)[] = Object.freeze(itemCategories);
export const ITEM_CATEGORY_GROUPS = Object.freeze([
  {
    key: 'tools',
    label: 'Tools',
    description: 'Gathering and utility tools',
    options: [
      { value: 'rope', label: 'Rope', description: 'Climbing and traversal tool' },
      { value: 'shovel', label: 'Shovel', description: 'Digging tool' },
      { value: 'pick', label: 'Pick', description: 'Mining tool' },
      { value: 'knife', label: 'Knife', description: 'Cutting and skinning tool' },
      { value: 'fishingRod', label: 'Fishing Rod', description: 'Fishing tool' },
      { value: 'machete', label: 'Machete', description: 'Clearing and chopping tool' },
    ],
  },
  {
    key: 'consumables',
    label: 'Consumables',
    description: 'Items intended to be consumed',
    options: [
      { value: 'potion', label: 'Potion', description: 'Drinkable or usable potion' },
      { value: 'food', label: 'Food', description: 'Food and provisions' },
    ],
  },
  {
    key: 'materials',
    label: 'Materials',
    description: 'Crafting and trade materials',
    options: [
      { value: 'wood', label: 'Wood', description: 'Logs, planks, and wooden components' },
      { value: 'metal', label: 'Metal', description: 'Ore, ingots, and metal components' },
      { value: 'cloth', label: 'Cloth', description: 'Fibres, fabric, and cloth components' },
      { value: 'leather', label: 'Leather', description: 'Hides and leather components' },
      { value: 'alchemy', label: 'Alchemy', description: 'Herbs, reagents, and alchemical components' },
    ],
  },
  {
    key: 'resources',
    label: 'Resources',
    description: 'Harvested and creature-sourced items',
    options: [
      { value: 'creatureProduct', label: 'Creature Product', description: 'Loot harvested from creatures' },
    ],
  },
] as const);

export const ITEM_CATEGORY_OPTIONS = Object.freeze([
  '',
  ...ITEM_CATEGORY_GROUPS.flatMap((group) => group.options.map((option) => option.value)),
]);

/** Categories whose instances may consume durability-style uses on the server. */
export const LIMITED_USE_ITEM_CATEGORIES = Object.freeze([
  'rope',
  'shovel',
  'pick',
  'knife',
  'fishingRod',
  'machete',
] as const);

export function isLimitedUseItemCategory(value: unknown): boolean {
  return typeof value === 'string'
    && LIMITED_USE_ITEM_CATEGORIES.includes(value as typeof LIMITED_USE_ITEM_CATEGORIES[number]);
}

/** Item categories that have an end-to-end server restriction and client icon. */
export const EXCLUSIVE_SLOT_TYPES = ITEM_SLOT_TYPES;
const THING_TYPES = [
  'bed', 'container', 'corpse', 'depot', 'door', 'fluidContainer', 'key',
  'magicfield', 'mailbox', 'readable', 'rune', 'splash', 'teleport',
  'trashholder', 'windowClosed', 'lever', 'chest', 'doorClosed', 'doorOpen',
  'wall', 'stair', 'trapdoor', 'taskboard', 'windowOpen',
] as const;
const HARVEST_TYPES = ['', 'mining', 'herbalism', 'skinning', 'fishing', 'chopping'] as const;
const HARVEST_MODES = ['keep', 'remove', 'transform', 'mark'] as const;

const ENUMS_BY_KEY: Readonly<Record<string, readonly (string | undefined)[]>> = {
  weaponType: WEAPON_TYPES,
  slotType: SLOT_TYPES,
  damageElement: ORB_DAMAGE_ELEMENTS,
  ammoType: AMMO_TYPES,
  itemType: ITEM_CATEGORIES,
  floorchange: FLOOR_CHANGES,
  field: ITEM_FIELD_TYPES,
  fluidSource: FLUID_SOURCES,
  type: THING_TYPES,
  harvestType: HARVEST_TYPES,
  harvestRequiredToolType: ITEM_CATEGORIES,
  harvestMode: HARVEST_MODES,
};

/** Convert persisted ItemCategory codes to the names used by editor controls. */
export function decodeExclusiveSlotsForEditor(value: unknown): ExclusiveSlotDef[] {
  if (!Array.isArray(value)) throw new Error('exclusiveSlots must be an array.');
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error(`exclusiveSlots[${index}] must be an object.`);
    }
    const slot = candidate as Record<string, unknown>;
    const extraKeys = Object.keys(slot).filter((key) => (
      key !== 'slotIndex' && key !== 'allowedItemTypes' && key !== 'allowedItemIds'
    ));
    if (extraKeys.length > 0) {
      throw new Error(`exclusiveSlots[${index}] contains unsupported field ${extraKeys[0]}.`);
    }
    if (slot.slotIndex !== index) {
      throw new Error(`exclusiveSlots[${index}] must have slotIndex ${index}.`);
    }
    if (!Array.isArray(slot.allowedItemTypes)) {
      throw new Error(`exclusiveSlots[${index}].allowedItemTypes must be an array.`);
    }
    const allowedItemTypes = slot.allowedItemTypes.map((type) => {
      if (typeof type !== 'number' || !Number.isInteger(type)) {
        throw new Error(`exclusiveSlots[${index}] contains a non-numeric item category.`);
      }
      const name = EXCLUSIVE_SLOT_TYPE_BY_CATEGORY_CODE[type];
      if (!name) {
        throw new Error(`exclusiveSlots[${index}] contains unsupported item category ${type}.`);
      }
      return name;
    });
    if (slot.allowedItemIds !== undefined && !Array.isArray(slot.allowedItemIds)) {
      throw new Error(`exclusiveSlots[${index}].allowedItemIds must be an array.`);
    }
    const allowedItemIds = Array.isArray(slot.allowedItemIds)
      ? slot.allowedItemIds.map((itemId) => {
        if (!Number.isInteger(itemId) || itemId <= 0 || itemId > 0xffff) {
          throw new Error(`exclusiveSlots[${index}] contains invalid item ID ${String(itemId)}.`);
        }
        return itemId as number;
      })
      : undefined;
    return {
      slotIndex: index,
      allowedItemTypes,
      ...(allowedItemIds?.length ? { allowedItemIds } : {}),
    };
  });
}

/** Convert editor names back to canonical ItemCategory codes for items.json. */
export function encodeExclusiveSlotsForStorage(value: unknown): Array<{
  slotIndex: number;
  allowedItemTypes: number[];
  allowedItemIds?: number[];
}> {
  if (!Array.isArray(value)) throw new Error('exclusiveSlots must be an array.');
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error(`exclusiveSlots[${index}] must be an object.`);
    }
    const slot = candidate as Record<string, unknown>;
    if (slot.slotIndex !== index) {
      throw new Error(`exclusiveSlots[${index}] must have slotIndex ${index}.`);
    }
    if (!Array.isArray(slot.allowedItemTypes)) {
      throw new Error(`exclusiveSlots[${index}].allowedItemTypes must be an array.`);
    }
    const allowedItemTypes = slot.allowedItemTypes.map((type) => {
      if (typeof type === 'number' && Number.isInteger(type)) {
        if (EXCLUSIVE_SLOT_TYPE_BY_CATEGORY_CODE[type]) return type;
      }
      if (typeof type === 'string' && type in EXCLUSIVE_SLOT_CATEGORY_CODE_BY_TYPE) {
        return EXCLUSIVE_SLOT_CATEGORY_CODE_BY_TYPE[type as ItemSlotType];
      }
      throw new Error(`exclusiveSlots[${index}] contains unsupported item category ${String(type)}.`);
    });
    const allowedItemIds = Array.isArray(slot.allowedItemIds)
      ? slot.allowedItemIds.map((itemId) => Number(itemId))
      : undefined;
    return {
      slotIndex: index,
      allowedItemTypes,
      ...(allowedItemIds?.length ? { allowedItemIds } : {}),
    };
  });
}

export function validateCanonicalExclusiveSlots(value: unknown): void {
  const slots = encodeExclusiveSlotsForStorage(value);
  for (const [index, slot] of slots.entries()) {
    if (slot.allowedItemTypes.length === 0) {
      throw new Error(`exclusiveSlots[${index}] must allow at least one item type.`);
    }
    if (new Set(slot.allowedItemTypes).size !== slot.allowedItemTypes.length) {
      throw new Error(`exclusiveSlots[${index}] contains duplicate item types.`);
    }
    for (const itemId of slot.allowedItemIds ?? []) {
      if (!Number.isInteger(itemId) || itemId <= 0 || itemId > 0xffff) {
        throw new Error(`exclusiveSlots[${index}] contains invalid item ID ${String(itemId)}.`);
      }
    }
    if (new Set(slot.allowedItemIds ?? []).size !== (slot.allowedItemIds ?? []).length) {
      throw new Error(`exclusiveSlots[${index}] contains duplicate item IDs.`);
    }
  }
}

/**
 * Equipment modifiers are additive values. Zero has the same gameplay meaning
 * as no modifier, so keep the canonical JSON clean by removing the attribute.
 * Do not apply this rule to every numeric property: zero is a valid value for
 * fields such as mannequinDirection.
 */
function isNeutralEquipmentModifier(key: string, value: unknown): boolean {
  return value === 0 && (
    key.startsWith('skill')
    || key === 'magiclevelpoints'
    || key.startsWith('absorbPercent')
    || key.startsWith('bonus')
  );
}

function decodePropertyValue(key: string, value: unknown): unknown {
  if (key === 'exclusiveSlots') {
    return value === undefined ? undefined : decodeExclusiveSlotsForEditor(value);
  }
  const values = ENUMS_BY_KEY[key];
  if (!values || typeof value !== 'number') return value;
  return values[value] ?? value;
}

function encodePropertyValue(key: string, value: unknown): unknown {
  if (key === 'attachmentBindings') validateItemAttachmentBindings(value);
  if (key === 'exclusiveSlots') return encodeExclusiveSlotsForStorage(value);
  const values = ENUMS_BY_KEY[key];
  if (!values || typeof value !== 'string') return value;
  const index = values.indexOf(value);
  if (index < 0) throw new Error(`Unknown canonical ${key} value "${value}"`);
  return index;
}

export function readItemProperty(
  properties: ItemProperties | null | undefined,
  key: string,
): unknown {
  if (!properties) return undefined;
  const code = ITEM_PROPERTY_CODE_BY_KEY[key];
  if (code == null) return undefined;
  return decodePropertyValue(key, properties[String(code)]);
}

export function normalizeItemPropertiesForEditor(
  properties: ItemProperties | null | undefined,
): ItemProperties {
  if (!properties) return {};
  const normalized: ItemProperties = { ...properties };
  for (const key of Object.keys(ITEM_PROPERTY_CODE_BY_KEY)) {
    const value = readItemProperty(properties, key);
    if (value !== undefined) normalized[key] = value as ItemProperties[string];
  }
  return normalized;
}

export function writeItemProperty(
  properties: ItemProperties,
  key: string,
  value: ItemProperties[string],
): void {
  const code = ITEM_PROPERTY_CODE_BY_KEY[key];
  const numericKey = code == null ? undefined : String(code);
  const remove = value === undefined
    || value === ''
    || value === false
    || isNeutralEquipmentModifier(key, value);
  delete properties[key];

  if (remove) {
    if (numericKey) delete properties[numericKey];
    return;
  }

  if (!numericKey) throw new Error(`Unknown canonical item property "${key}"`);
  properties[numericKey] = encodePropertyValue(key, value) as ItemProperties[string];
}

/** Rejects legacy or contradictory weapon metadata before an asset package is emitted. */
export function validateCanonicalWeaponProperties(
  properties: ItemProperties | null | undefined,
): void {
  const weaponType = readItemProperty(properties, 'weaponType');
  const ammoType = readItemProperty(properties, 'ammoType');
  const damageElement = readItemProperty(properties, 'damageElement');
  if (weaponType !== undefined && weaponType !== ''
    && (typeof weaponType !== 'string' || !WEAPON_TYPES.includes(weaponType as never))) {
    throw new Error(`Unknown canonical weaponType value "${String(weaponType)}"`);
  }
  if (ammoType !== undefined && ammoType !== ''
    && (typeof ammoType !== 'string' || !AMMO_TYPES.includes(ammoType as never))) {
    throw new Error(`Unknown canonical ammoType value "${String(ammoType)}"`);
  }
  const isAmmoWeapon = weaponType === 'bow'
    || weaponType === 'crossbow'
    || weaponType === 'short_bow';
  if (weaponType && ammoType && !isAmmoWeapon) {
    throw new Error('Only bows and crossbows may define both weaponType and ammoType.');
  }
  if (isAmmoWeapon && !ammoType) {
    throw new Error(`${weaponType} items require ammoType.`);
  }
  if (weaponType === 'orb' && !damageElement) {
    throw new Error('Orb items require damageElement.');
  }
  if (weaponType !== 'orb' && damageElement) {
    throw new Error('damageElement is exclusive to orb items.');
  }
}

/** Max Uses is prototype data and is only meaningful for consumable tools. */
export function validateCanonicalMaxUses(
  properties: ItemProperties | null | undefined,
): void {
  const maxUses = readItemProperty(properties, 'maxUses');
  if (maxUses === undefined) return;
  const itemType = readItemProperty(properties, 'itemType');
  if (!isLimitedUseItemCategory(itemType)) {
    throw new Error(
      `maxUses is only valid for ${LIMITED_USE_ITEM_CATEGORIES.join(', ')} items.`,
    );
  }
  if (typeof maxUses !== 'number' || !Number.isInteger(maxUses) || maxUses <= 0 || maxUses > 0xffff) {
    throw new Error('maxUses must be an integer between 1 and 65535.');
  }
}

export function hasEquipmentClassification(
  properties: ItemProperties | null | undefined,
): boolean {
  const weaponType = readItemProperty(properties, 'weaponType');
  const slotType = readItemProperty(properties, 'slotType');
  return (
    (typeof weaponType === 'string' && weaponType.trim() !== '')
    || (typeof slotType === 'string' && slotType.trim() !== '')
  );
}

export type EquipmentClassificationKind = 'weapon' | 'slot';

export interface EquipmentClassification {
  key: string;
  kind: EquipmentClassificationKind;
  value: string;
  label: string;
}

function formatEquipmentClassificationLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Return the category used to group an equipment appearance in the library.
 * Weapon type is more specific than its generic hand slot, so it wins when
 * both properties are present.
 */
export function getEquipmentClassification(
  properties: ItemProperties | null | undefined,
): EquipmentClassification | null {
  const weaponType = readItemProperty(properties, 'weaponType');
  if (typeof weaponType === 'string' && weaponType.trim() !== '') {
    const value = weaponType.trim();
    return {
      key: `weapon:${value.toLowerCase()}`,
      kind: 'weapon',
      value,
      label: formatEquipmentClassificationLabel(value),
    };
  }

  const slotType = readItemProperty(properties, 'slotType');
  if (typeof slotType === 'string' && slotType.trim() !== '') {
    const value = slotType.trim();
    return {
      key: `slot:${value.toLowerCase()}`,
      kind: 'slot',
      value,
      label: formatEquipmentClassificationLabel(value),
    };
  }

  return null;
}
