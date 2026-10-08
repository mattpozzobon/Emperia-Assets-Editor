const assert = require('node:assert/strict');
const fs = require('node:fs');
require('../../Emperia-Client/scripts/test-support/register-client-typescript.cjs');
const { parseObjectData } = require('../src/lib/object-parser.ts');
const { compileObjectData } = require('../src/lib/object-writer.ts');
const { EOBJ_FORMAT_VERSION } = require('../src/lib/emperia-format.ts');
const ObjectBuffer = require('../../Emperia-Client/client/src/engine/core/object-buffer.ts').default;
const { parseVisualCatalog } = require('../../Emperia-Server/src/game/core/creature/visual-catalog.ts');
const { parseObjects } = require('../../Emperia-Data-Editor/src/game-preview-assets.ts');
const { colorAppearance, materialAppearance } = require('../../Emperia-Server/src/shared/appearance.ts');
const { ATTACHMENT_POINTS, normalizeAttachments } = require('../../Emperia-Server/src/shared/attachments.ts');
const { buildBeltAttachments } = require('../../Emperia-Server/src/game/core/item/equipment/belt-attachments.ts');
const { BeltHotbarState } = require('../../Emperia-Server/src/game/core/item/equipment/belt-hotbar-state.ts');
const { Outfit: ServerOutfit } = require('../../Emperia-Server/src/game/core/creature/player/outfit.ts');
const { z } = require('../../Emperia-Server/node_modules/zod');
const { OutfitSchema } = require('../../Emperia-Server/src/platform/data/schemas/outfit-schema.ts');
const { MonsterSchema } = require('../../Emperia-Server/src/platform/data/schemas/monster-schema.ts');
const { NPCSchema } = require('../../Emperia-Server/src/platform/data/schemas/npc-schema.ts');
const ClientOutfit = require('../../Emperia-Client/client/src/engine/domain/outfit.ts').default;
const { GroupKey, SlotKey } = require('../../Emperia-Client/client/src/engine/domain/outfit.ts');
const { getOutfitWireSize, writeOutfit, getAttachmentsWireSize, writeAttachments } = require('../../Emperia-Server/src/platform/protocol/serialization/outfit-wire-format.ts');
const { AppearanceDeltaPacket, getAppearanceDeltaMask } = require('../../Emperia-Server/src/platform/protocol/packets/entities/creature-packets.ts');
const { AppearanceDeltaFlag, EntityUpdateKind } = require('../../Emperia-Server/src/platform/protocol/generated/protocol-contract.generated.ts');
const { applyItemAppearanceReaders, readAttachments } = require('../../Emperia-Client/client/src/engine/network/readers/item-appearance-readers.ts');
const PacketReader = require('../../Emperia-Client/client/src/engine/network/packetreader.ts').default;
const { EntityUpdateDecoder } = require('../../Emperia-Client/client/src/engine/network/entity-update-decoder.ts');
const { setGameClient } = require('../../Emperia-Client/client/src/shared/services/gameClientContext.ts');
const { getOrderedLayers } = require('../../Emperia-Client/client/src/renderer/creatures/creature-rendering-model.ts');
const { getOutfitVisualKey } = require('../../Emperia-Client/client/src/renderer/creatures/outfit-visual-key.ts');
const { iterateOutfitPrecacheTasks } = require('../../Emperia-Client/client/src/renderer/creatures/creature-sprite-precache-tasks.ts');
const { getComposedOutfitKey, applyOutfitMask } = require('../../Emperia-Client/client/src/renderer/assets/outfit-sprite-composer.ts');
const { CreatureProperties } = (() => { const value = require('../../Emperia-Server/src/game/core/creature/creature-properties.ts'); return { CreatureProperties: value.default ?? value.CreatureProperties }; })();

// The Data Editor exports these schemas during startup. Validation schemas must
// remain representable; migration belongs to the runtime Outfit constructor.
for (const schema of [OutfitSchema, MonsterSchema, NPCSchema]) assert.ok(z.toJSONSchema(schema).properties);
const legacyOutfit = { id: 128, attachments: { healthPotion: 1, manaPotion: 0, energyPotion: 0, bag: 1 } };
assert.deepEqual(OutfitSchema.parse(legacyOutfit), legacyOutfit, 'validation preserves the authored input');
const migratedOutfit = new ServerOutfit(OutfitSchema.parse(legacyOutfit));
assert.equal(migratedOutfit.attachments.belt1.attachmentId, 1);
assert.equal(migratedOutfit.attachments.beltPouch, undefined);
const canonicalOutfit = { id: 128, attachments: { belt2: { attachmentId: 2, appearance: colorAppearance(0xFF0000) } } };
assert.deepEqual(new ServerOutfit(OutfitSchema.parse(canonicalOutfit)).attachments, canonicalOutfit.attachments);
assert.equal(OutfitSchema.safeParse({ id: 128, attachments: { belt2: { attachmentId: 0 } } }).success, false);

const bytes = fs.readFileSync(require('node:path').resolve(__dirname, '../../Emperia-Assets/current/emperia.eobj'));
const original = parseObjectData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
for (let index = 0; index < 3; index++) {
  const entry = original.attachmentCatalog.get(1 + index);
  assert.equal(entry.legacySourceEquipmentId, undefined);
  assert.equal(entry.attachment.point, `belt${index + 1}`);
}
// Add a future backpack attachment without changing the sprite art.
const bankStart = original.itemCount + original.outfitCount + original.equipmentCount + original.hairCount + original.effectCount + original.distanceCount + original.beardCount;
const legacyObjects = new ObjectBuffer();
legacyObjects.__load('legacy-attachment-test.eobj', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const equipmentStart = original.itemCount + original.outfitCount + 1;
const equipment77 = original.things.get(equipmentStart + 74);
assert.ok(equipment77 && equipment77.category === 'equipment');
assert.deepEqual(equipment77.frameGroups.map(g => g.sprites), legacyObjects.getEquipment(78).frameGroups.map(g => g.sprites), 'former Equipment 77 retains its artwork');
assert.equal(original.attachmentCount, 3);
assert.equal(original.equipmentCount, 183, 'source records are removed from Equipment');
assert.equal([...original.things.values()].filter(t => t.category === 'equipment').length, 183);
for (let id = 1; id <= 3; id++) {
  const source = legacyObjects.getEquipment(74 + id);
  const attachment = original.things.get(bankStart + id);
  assert.equal(attachment.category, 'attachments');
  assert.deepEqual(attachment.frameGroups.map(g => g.sprites), source.frameGroups.map(g => g.sprites));
  assert.equal(attachment.frameGroups[0].width, source.frameGroups[0].width);
  assert.equal(attachment.frameGroups[0].height, source.frameGroups[0].height);
  assert.equal(attachment.frameGroups[0].patternX, 4);
}
const migrate = require('../src/lib/attachment-library.ts').migrateAttachmentLibrary;
assert.equal(migrate(original), original, 'migration is idempotent');
// Recreate the first v19 layout with duplicated equipment sources, then reload it.
const duplicated = { ...original, formatVersion: 19, equipmentCount: original.equipmentCount + 3,
  things: new Map(), attachmentCatalog: new Map(), equipmentAppearances: new Map(), visualEquipmentAppearances: new Map() };
for (const [id, thing] of original.things) {
  const nextId = id >= equipmentStart + 74 ? id + 3 : id;
  duplicated.things.set(nextId, { ...thing, id: nextId });
}
for (let id = 1; id <= 3; id++) {
  const sourceId = equipmentStart + 73 + id;
  duplicated.things.set(sourceId, { ...original.things.get(bankStart + id), id: sourceId, category: 'equipment' });
  duplicated.attachmentCatalog.set(id, { ...original.attachmentCatalog.get(id), legacySourceEquipmentId: 73 + id });
}
for (const [id, entry] of original.equipmentAppearances) {
  duplicated.equipmentAppearances.set(id, Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, value >= 74 ? value + 3 : value])));
}
for (const [id, entry] of original.visualEquipmentAppearances) {
  duplicated.visualEquipmentAppearances.set(id, { ...entry, equipmentAppearanceId: entry.equipmentAppearanceId >= 74 ? entry.equipmentAppearanceId + 3 : entry.equipmentAppearanceId });
}
const repaired = parseObjectData(compileObjectData(duplicated));
assert.equal(repaired.equipmentCount, original.equipmentCount);
assert.deepEqual(repaired.equipmentAppearances, original.equipmentAppearances);
assert.deepEqual(repaired.visualEquipmentAppearances, original.visualEquipmentAppearances);
assert.deepEqual(repaired.attachmentCatalog, original.attachmentCatalog);
for (const [id, thing] of original.things) assert.deepEqual(repaired.things.get(id).frameGroups, thing.frameGroups);
original.attachmentCount = 4;
original.attachmentCatalog.set(4, { attachmentId: 4, name: 'Backpack test', attachment: { point: 'backpackLeft', ranks: [3, 4, 4, 3] } });
original.things.set(bankStart + 4, { ...original.things.get(bankStart + 1), id: bankStart + 4 });
const compiled = compileObjectData(original);
const reparsed = parseObjectData(compiled);
assert.equal(reparsed.formatVersion, EOBJ_FORMAT_VERSION);
assert.deepEqual(reparsed.attachmentCatalog, original.attachmentCatalog);
assert.deepEqual(reparsed.things.get(equipmentStart + 74).frameGroups, equipment77.frameGroups);
assert.ok(![...reparsed.attachmentCatalog.values()].some(entry => entry.legacySourceEquipmentId === 77));
for (const [id, value] of original.visualEquipmentAppearances) assert.deepEqual(JSON.parse(JSON.stringify(reparsed.visualEquipmentAppearances.get(id))), JSON.parse(JSON.stringify(value)));
for (const [id, thing] of original.things) assert.deepEqual(reparsed.things.get(id).frameGroups, thing.frameGroups, `art ${id} must remain unchanged`);
const objects = new ObjectBuffer(); objects.__load('attachment-test.eobj', compiled);
assert.equal(objects.getAttachmentAppearance(1), 1, 'attachments keep their own indices');
assert.notEqual(objects.getAttachment(1), objects.getEquipment(75));
assert.deepEqual(objects.getAttachment(1).frameGroups[0].sprites, legacyObjects.getEquipment(75).frameGroups[0].sprites);
assert.equal(objects.getAttachmentAppearance(77), 0);
assert.deepEqual(objects.getEquipment(objects.getVisualEquipmentAppearance(803)).frameGroups[0].sprites,
  legacyObjects.getEquipment(78).frameGroups[0].sprites, 'ordinary equipment catalog references follow compaction');
assert.deepEqual(objects.getAttachmentDefinition(4), original.attachmentCatalog.get(4).attachment);
assert.ok(parseVisualCatalog(Buffer.from(compiled)));
assert.ok(parseObjects(new Uint8Array(compiled)), 'data editor parses the new metadata without shifting records');
assert.equal(legacyObjects.getAttachmentAppearance(1), 1);
assert.ok(legacyObjects.getAttachment(3));
assert.equal(legacyObjects.getAttachmentDefinition(77), undefined);
setGameClient({ dataObjects: objects });

const slot = (itemId, quantity = 1) => ({ itemId, quantity });
const resolve = id => ({ 11: 'health', 12: 'mana', 13: 'stamina' })[id];
const attachments = buildBeltAttachments([slot(11), slot(11), slot(12), slot(13), slot(13)], resolve);
assert.equal(attachments.belt1.attachmentId, 1);
assert.equal(attachments.belt2.attachmentId, 2);
assert.equal(attachments.belt3.attachmentId, 3);
assert.deepEqual(attachments.belt1.appearance, attachments.belt2.appearance, 'same type in different positions');
assert.equal(attachments.belt3.appearance.primary, 0x0000FF);
assert.deepEqual(buildBeltAttachments([slot(0), slot(12), slot(13, 0)], resolve), { belt1: null, belt2: { attachmentId: 2, appearance: colorAppearance(0x0000FF) }, belt3: null });
assert.deepEqual(buildBeltAttachments([], resolve), { belt1: null, belt2: null, belt3: null });
// Potion slots need not begin at container index zero.
const items = [null, null, { id: 11, count: 3, isPotion: () => true }, null, { id: 12, count: 1, isPotion: () => true }];
const belt = { isContainer: () => true, container: { peekIndex: index => items[index] }, getPotionSlotCount: () => 3, getPotionSlotIndex: index => index + 2 };
const hotbar = new BeltHotbarState();
assert.equal(buildBeltAttachments(hotbar.capture(belt), resolve).belt3.appearance.primary, 0x0000FF);
items[2] = null;
assert.equal(buildBeltAttachments(hotbar.capture(belt), resolve).belt1, null);

const values = [undefined, colorAppearance(0xFF0000), colorAppearance(0x123456, 0xABCDEF), materialAppearance(7, 0x123456)];
let fullRoundTrips = 0;
const target = new Uint8Array(256); let written = 0;
const writer = { writeUInt8(value) { target[written++] = value; }, writeUInt16(value) { this.writeUInt8(value); this.writeUInt8(value >>> 8); } };
const outfitSlots = Array.from({ length: 10 }, () => ({ id: 0 }));
for (let mask = 0; mask < 128; mask++) for (const appearance of values) {
  const entries = Object.fromEntries(ATTACHMENT_POINTS.flatMap((point, index) => mask & (1 << index) ? [[point, { attachmentId: 1 + index, appearance }]] : []));
  const outfit = new ServerOutfit({ id: 128, sprites: outfitSlots, attachments: entries, lightSourceItemId: 65000 });
  written = 0; writeOutfit(writer, outfit); assert.equal(written, getOutfitWireSize(outfit));
  const size = written; writer.writeUInt16(0xBEEF);
  const reader = new PacketReader(target.subarray(0, written));
  const decoded = reader.readOutfit();
  assert.deepEqual(decoded.attachments, outfit.attachments);
  assert.equal(decoded.lightSourceItemId, 65000); assert.equal(reader.index, size); assert.equal(reader.readUInt16(), 0xBEEF);
  fullRoundTrips++;
}
const before = new ServerOutfit({ id: 128, attachments });
const after = before.copy(); delete after.attachments.belt1; after.attachments.belt2.appearance = colorAppearance(0x00FF00);
after.attachments.backpackLeft = { attachmentId: 4, appearance: colorAppearance(0x123456) };
assert.equal(before.attachments.belt2.appearance.primary, 0xFF0000, 'copies do not share mutable attachment appearances');
assert.equal(getAppearanceDeltaMask(before, before.copy()), 0);
assert.equal(getAppearanceDeltaMask(before, after), AppearanceDeltaFlag.Attachments);
for (const next of [after, new ServerOutfit({ id: 128 })]) {
  const packet = new AppearanceDeltaPacket(42, before, next);
  let delta;
  const decoder = new EntityUpdateDecoder({ handleAppearanceDelta(value) { delta = value; } });
  const reader = new PacketReader(packet.buffer);
  assert.equal(packet.buffer[1], EntityUpdateKind.AppearanceDelta);
  reader.index = 1; // Skip the enclosing opcode; the decoder starts at the kind.
  decoder.decode(reader);
  assert.deepEqual(delta.attachments, next.attachments);
  assert.equal(reader.index, packet.buffer.length);
}
// Shared update helper preserves backpack points and skips quantity-only changes.
let publications = 0; let current = after;
const properties = { getProperty: () => current, setProperty: (_key, value) => { current = value; publications++; } };
CreatureProperties.prototype.updateOutfitAttachments.call(properties, { belt2: after.attachments.belt2 });
assert.equal(publications, 0);
CreatureProperties.prototype.updateOutfitAttachments.call(properties, { belt1: null, belt2: null, belt3: null });
assert.equal(publications, 1); assert.ok(current.attachments.backpackLeft); assert.equal(current.attachments.belt2, undefined);
assert.equal(normalizeAttachments({ healthPotion: 1, bag: 1 }).beltPouch, undefined, 'no automatic pouch binding');

const clientA = new ClientOutfit({ id: 128, attachments: before.attachments });
const clientB = new ClientOutfit({ id: 129, attachments: after.attachments });
assert.notEqual(getOutfitVisualKey(clientA), getOutfitVisualKey(clientB));
const maskedGroup = { width: 1, height: 1, layers: 2, animationLength: 1, getSpriteId: (_frame, _dir, _y, _z, layer) => layer === 1 ? 9001 : 9000 };
const fakeObjects = { getAttachmentAppearance: id => id, getAttachment: () => ({ getFrameGroup: () => maskedGroup, frameGroups: [maskedGroup] }) };
const tasks = [...iterateOutfitPrecacheTasks(clientA, fakeObjects)];
assert.ok(tasks.length); assert.ok(tasks.every(task => task.maskId === 9001 && task.colorSlot === undefined && task.appearanceOverride));
const sharedAppearance = colorAppearance(0xFF0000);
const key = outfit => getComposedOutfitKey(outfit, 9000, maskedGroup, 0, 0, 0, 0, 0, 0, undefined, 9001, sharedAppearance);
assert.equal(key(clientA), key(clientB), 'identical attachment pixels share a texture across characters');
const base = { data: new Uint8ClampedArray([255,255,255,255, 70,80,90,255]), width: 2 };
const maskPixels = { data: new Uint8ClampedArray([255,255,0,255, 0,0,0,0]) };
applyOutfitMask(base, maskPixels, clientA, undefined, sharedAppearance);
assert.deepEqual([...base.data], [255,0,0,255,70,80,90,255], 'only the liquid mask changes');
for (let direction = 0; direction < 4; direction++) {
  const order = getOrderedLayers(direction, clientB);
  assert.ok(order.some(layer => layer.groupKey === GroupKey.BackpackLeft));
  assert.ok(order.findIndex(layer => layer.groupKey === GroupKey.BackpackLeft) > order.findIndex(layer => layer.groupKey === GroupKey.Backpack));
}
assert.throws(() => readAttachments(new PacketReader(new Uint8Array([128]))), /Unknown attachment/);
assert.throws(() => readAttachments(new PacketReader(new Uint8Array([1,0,0,4]))), /Invalid attachment/);
async function verifyEquipmentLifecycle() {
  const Equipment = require('../../Emperia-Server/src/game/core/item/equipment.ts').default;
  const { getPotionCatalog } = require('../../Emperia-Server/src/game/core/item/potion-config.ts');
  const health = getPotionCatalog().configs.find(config => config.definition.recovery[0]?.resource === 'health').definition.itemId;
  const mana = getPotionCatalog().configs.find(config => config.definition.recovery[0]?.resource === 'mana').definition.itemId;
  const potion = (id, count = 1) => ({ id, count, isPotion: () => true });
  const heldItems = [null, null, potion(health, 2), potion(health), potion(mana)];
  let equippedBelt = { isContainer: () => true, container: { peekIndex: index => heldItems[index] }, getPotionSlotCount: () => 3, getPotionSlotIndex: index => index + 2 };
  let outfit = new ServerOutfit({ id: 128, attachments: { backpackLeft: { attachmentId: 4 } } });
  let appearances = 0, hotbarSends = 0;
  const properties = { getProperty: () => outfit, setProperty: (_key, value) => { outfit = value; appearances++; } };
  properties.updateOutfitAttachments = updates => CreatureProperties.prototype.updateOutfitAttachments.call(properties, updates);
  const equipment = Object.create(Equipment.prototype);
  Object.assign(equipment, { __retired: false, __beltHotbarState: new BeltHotbarState(), __player: { properties, io: { sendBeltHotbarSlots: () => hotbarSends++ } }, peekIndex: () => equippedBelt });
  equipment.notifyBeltContentsChanged(); equipment.notifyBeltContentsChanged(); await Promise.resolve();
  assert.equal(appearances, 1); assert.equal(hotbarSends, 1, 'same mutation batch publishes once');
  assert.equal(outfit.attachments.belt2.attachmentId, 2);
  heldItems[2].count = 1; equipment.notifyBeltContentsChanged(); await Promise.resolve();
  assert.equal(appearances, 1, 'quantity changes keep the same rendered attachment');
  heldItems[2] = null; equipment.notifyBeltContentsChanged(); await Promise.resolve();
  assert.equal(outfit.attachments.belt1, undefined, 'last potion removes its attachment');
  heldItems[3] = potion(mana); heldItems[4] = potion(health); equipment.notifyBeltContentsChanged(); await Promise.resolve();
  assert.equal(outfit.attachments.belt2.appearance.primary, 0x0000FF); assert.equal(outfit.attachments.belt3.appearance.primary, 0xFF0000);
  equippedBelt = null; equipment.notifyBeltContentsChanged(); await Promise.resolve();
  assert.deepEqual(outfit.attachments, { backpackLeft: { attachmentId: 4 } }, 'unequipping belt keeps independent backpack attachments');
  const sends = hotbarSends;
  equipment.notifyBeltContentsChanged(); equipment.retire(); await Promise.resolve();
  assert.equal(hotbarSends, sends, 'retired equipment does not publish delayed changes');
}
verifyEquipmentLifecycle().then(() => console.log(JSON.stringify({ fullRoundTrips, formatVersion: EOBJ_FORMAT_VERSION, verified: ['74/75/76 preserved', 'duplicate potion types', 'physical hotbar positions', 'consumption/reorder/unequip/retirement', 'backpack preservation', 'full and delta packets', 'mask pixels', 'shared textures', 'all asset readers'] }, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
