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
const { ATTACHMENT_POINTS, cloneAttachments, applyAttachmentUpdates } = require('../../Emperia-Server/src/shared/attachments.ts');
const { buildItemAttachments, ItemAttachmentProjection } = require('../../Emperia-Server/src/game/core/item/equipment/item-attachments.ts');
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
for (const attachments of [{ healthPotion: 1 }, { belt1: { visualEquipmentId: 800 } }]) {
  assert.equal(OutfitSchema.safeParse({ id: 128, attachments }).success, false);
  assert.throws(() => new ServerOutfit({ id: 128, attachments }), /Invalid attachment/);
  assert.throws(() => new ClientOutfit({ id: 128, attachments }), /Invalid attachment/);
}
const canonicalOutfit = { id: 128, attachments: { belt2: { attachmentId: 2, appearance: colorAppearance(0xFF0000) } } };
assert.deepEqual(new ServerOutfit(OutfitSchema.parse(canonicalOutfit)).attachments, canonicalOutfit.attachments);
assert.equal(OutfitSchema.safeParse({ id: 128, attachments: { belt2: { attachmentId: 0 } } }).success, false);

const bytes = fs.readFileSync(require('node:path').resolve(__dirname, '../../Emperia-Assets/current/emperia.eobj'));
const original = parseObjectData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
for (let index = 0; index < 4; index++) {
  const entry = original.attachmentCatalog.get(1 + index);
  assert.equal(entry.attachment.point, ['belt1', 'belt4', 'belt3', 'belt2'][index]);
}
// Add a future backpack attachment without changing the sprite art.
const bankStart = original.itemCount + original.outfitCount + original.equipmentCount + original.hairCount + original.effectCount + original.distanceCount + original.beardCount;
const sourceObjects = new ObjectBuffer();
sourceObjects.__load('source-attachment-test.eobj', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const equipmentStart = original.itemCount + original.outfitCount + 1;
const equipment77 = original.things.get(equipmentStart + 77);
assert.ok(equipment77 && equipment77.category === 'equipment');
assert.deepEqual(equipment77.frameGroups.map(g => g.sprites), sourceObjects.getEquipment(78).frameGroups.map(g => g.sprites), 'Equipment 77 retains its original artwork');
assert.ok(original.attachmentCount >= 4);
assert.equal(original.attachmentCatalog.get(4).attachment.point, 'belt2');
assert.equal(original.equipmentCount, 186, 'original Equipment indices are preserved');
assert.equal([...original.things.values()].filter(t => t.category === 'equipment').length, 186);
for (const id of [74, 75, 76]) assert.ok(original.things.get(equipmentStart + id).frameGroups.every(group => group.sprites.every(sprite => sprite === 0)), `Equipment ${id} is transparent`);
for (let id = 1; id <= 3; id++) {
  const attachment = original.things.get(bankStart + id);
  assert.equal(attachment.category, 'attachments');
  assert.deepEqual(attachment.frameGroups.map(g => g.sprites), sourceObjects.getAttachment(id).frameGroups.map(g => g.sprites));
  assert.equal(attachment.frameGroups[0].patternX, 4);
}
const testBackpackId = original.attachmentCount + 1;
original.attachmentCount = testBackpackId;
original.attachmentCatalog.set(testBackpackId, { attachmentId: testBackpackId, name: 'Backpack test', attachment: { point: 'backpackLeft', ranks: [3, 4, 4, 3] } });
original.things.set(bankStart + testBackpackId, { ...original.things.get(bankStart + 1), id: bankStart + testBackpackId });
const compiled = compileObjectData(original);
const reparsed = parseObjectData(compiled);
assert.equal(reparsed.formatVersion, EOBJ_FORMAT_VERSION);
assert.deepEqual(reparsed.attachmentCatalog, original.attachmentCatalog);
assert.deepEqual(reparsed.things.get(equipmentStart + 77).frameGroups, equipment77.frameGroups);
for (const [id, value] of original.visualEquipmentAppearances) assert.deepEqual(JSON.parse(JSON.stringify(reparsed.visualEquipmentAppearances.get(id))), JSON.parse(JSON.stringify(value)));
for (const [id, thing] of original.things) assert.deepEqual(reparsed.things.get(id).frameGroups, thing.frameGroups, `art ${id} must remain unchanged`);
const objects = new ObjectBuffer(); objects.__load('attachment-test.eobj', compiled);
assert.equal(objects.getAttachmentAppearance(1), 1, 'attachments keep their own indices');
assert.notEqual(objects.getAttachment(1), objects.getEquipment(75));
assert.deepEqual(objects.getAttachment(1).frameGroups[0].sprites, sourceObjects.getAttachment(1).frameGroups[0].sprites);
assert.equal(objects.getAttachmentAppearance(77), 0);
assert.deepEqual(objects.getEquipment(objects.getVisualEquipmentAppearance(803)).frameGroups[0].sprites,
  equipment77.frameGroups[0].sprites, 'ordinary equipment catalog references return to original indices');
assert.deepEqual(objects.getAttachmentDefinition(testBackpackId), original.attachmentCatalog.get(testBackpackId).attachment);
assert.ok(parseVisualCatalog(Buffer.from(compiled)));
assert.ok(parseObjects(new Uint8Array(compiled)), 'data editor parses the new metadata without shifting records');
assert.equal(sourceObjects.getAttachmentAppearance(1), 1);
assert.ok(sourceObjects.getAttachment(3));
assert.equal(sourceObjects.getAttachmentDefinition(77), undefined);
setGameClient({ dataObjects: objects });
const beltOrderOutfit = new ClientOutfit({ id: 128, attachments: {
  belt2: { attachmentId: 4 }, belt3: { attachmentId: 3 },
} });
const eastOrder = getOrderedLayers(1, beltOrderOutfit);
assert.ok(eastOrder.findIndex(layer => layer.groupKey === GroupKey.Belt2) > eastOrder.findIndex(layer => layer.groupKey === GroupKey.Belt3), 'East draws slot 2 after slot 3.');
for (const direction of [0, 2, 3]) {
  const order = getOrderedLayers(direction, beltOrderOutfit);
  assert.ok(order.findIndex(layer => layer.groupKey === GroupKey.Belt2) < order.findIndex(layer => layer.groupKey === GroupKey.Belt3), 'Other cardinal directions retain their existing slot order.');
}

const slot = (itemId, quantity = 1) => ({ itemId, quantity });
const resolve = id => ({ 11: colorAppearance(0xff0000), 12: colorAppearance(0x0000ff), 13: colorAppearance(0x00ff00) })[id];
for (const [index, expectedId] of [1, 4, 3, 2].entries()) {
  const slots = Array.from({ length: 4 }, (_, position) => slot(position === index ? 11 : 0));
  const projected = buildItemAttachments(slots, resolve);
  const point = `belt${index + 1}`;
  assert.deepEqual(Object.keys(projected), [point], 'Only the occupied physical slot emits an attachment');
  const received = new ClientOutfit({ id: 128, attachments: projected });
  assert.equal(received.attachments[point].attachmentId, expectedId);
  assert.equal(objects.getAttachmentDefinition(expectedId).point, point);
  assert.deepEqual(objects.getAttachment(expectedId).frameGroups, sourceObjects.getAttachment(expectedId).frameGroups);
}
const attachments = buildItemAttachments([slot(11), slot(11), slot(12), slot(13), slot(13)], resolve);
const authoredAppearance = { kind: 'color', primary: 0x123456, secondary: 0x654321 };
assert.deepEqual(buildItemAttachments([slot(11), slot(11), slot(11)], () => authoredAppearance), {
  belt1: { attachmentId: 1, appearance: authoredAppearance },
  belt2: { attachmentId: 4, appearance: authoredAppearance },
  belt3: { attachmentId: 3, appearance: authoredAppearance },
}, 'Each physical slot uses its positional artwork and the same per-item mask colours');
assert.equal(attachments.belt1.attachmentId, 1);
assert.equal(attachments.belt2.attachmentId, 4);
assert.equal(attachments.belt3.attachmentId, 3);
assert.equal(attachments.belt4.attachmentId, 2);
assert.equal(attachments.belt4.appearance.primary, 0x00FF00);
assert.equal(attachments.belt5, undefined, 'The fifth slot has no default artwork yet.');
assert.equal(buildItemAttachments([slot(0), slot(0), slot(0), slot(13, 0)], resolve).belt4, undefined, 'Empty fourth slots emit nothing.');
assert.deepEqual(attachments.belt1.appearance, attachments.belt2.appearance, 'same type in different positions');
assert.equal(attachments.belt3.appearance.primary, 0x0000FF);
assert.deepEqual(buildItemAttachments([slot(0), slot(12), slot(13, 0)], resolve), { belt2: { attachmentId: 4, appearance: colorAppearance(0x0000FF) } });
// A watched colour-only reload invalidates the projection even when item IDs
// and quantities are unchanged. Stable catalog snapshots still emit nothing.
const potionConfigModule = require('../../Emperia-Server/src/game/core/item/potion-config.ts');
const previousCatalogGetter = potionConfigModule.getPotionCatalog;
const previousItemGetter = potionConfigModule.getPotionConfigByItemId;
try {
  let catalog = { byItemId: new Map([[11, { attachmentAppearance: authoredAppearance }]]) };
  let catalogReads = 0;
  potionConfigModule.getPotionCatalog = () => { catalogReads++; return catalog; };
  potionConfigModule.getPotionConfigByItemId = id => catalog.byItemId.get(id) ?? null;
  const { DEFAULT_BELT_BINDINGS } = require('../../Emperia-Server/src/shared/attachments.ts');
  const projection = new ItemAttachmentProjection();
  assert.deepEqual(projection.capture([slot(11)], DEFAULT_BELT_BINDINGS).belt1.appearance, authoredAppearance);
  assert.equal(projection.capture([slot(11, 2)], DEFAULT_BELT_BINDINGS), undefined);
  const nextAppearance = { kind: 'color', primary: 0xabcdef };
  catalog = { byItemId: new Map([[11, { attachmentAppearance: nextAppearance }]]) };
  assert.deepEqual(projection.capture([slot(11, 2)], DEFAULT_BELT_BINDINGS).belt1.appearance, nextAppearance);
  assert.equal(projection.capture([slot(11, 3)], DEFAULT_BELT_BINDINGS), undefined);
  catalogReads = 0;
  assert.equal(Object.keys(buildItemAttachments([slot(11), slot(11), slot(11)])).length, 3);
  assert.equal(catalogReads, 1, 'A complete projection reads one catalog snapshot.');
  const sharedBindings = Object.freeze([
    { point: 'belt1', attachmentId: 1, potionSlot: 0 },
    { point: 'belt2', attachmentId: 3, potionSlot: 0 },
    { point: 'belt3', attachmentId: 2, potionSlot: 0 },
    { point: 'belt4', attachmentId: 1, potionSlot: 1 },
    { point: 'backpackLeft', attachmentId: 4 },
  ]);
  let slotReads = 0;
  const sources = [{ id: 11, count: 3, isPotion: () => true }, { id: 11, count: 1, isPotion: () => true }];
  const container = { getPotionSlotIndex: index => index, container: { peekIndex: index => { slotReads++; return sources[index]; } } };
  const shared = new ItemAttachmentProjection();
  catalogReads = 0;
  const first = shared.captureContainer(container, sharedBindings);
  assert.equal(Object.keys(first).length, 5, 'Repeated sources and static backpack bindings remain independent attachments.');
  assert.equal(slotReads, 2, 'Each distinct potion source is read once, even with multiple bindings.');
  assert.equal(catalogReads, 1, 'Change detection and projection share the same catalog snapshot.');
  sources[0].count--;
  assert.equal(shared.captureContainer(container, sharedBindings), undefined, 'Shared bindings also suppress quantity-only updates.');
  sources[0] = null;
  assert.deepEqual(Object.keys(shared.captureContainer(container, sharedBindings)), ['belt4', 'backpackLeft'], 'Empty shared slots remove every dependent binding.');
  const switchedBindings = Object.freeze([{ point: 'belt5', attachmentId: 2, potionSlot: 1 }]);
  assert.deepEqual(Object.keys(shared.captureContainer(container, switchedBindings)), ['belt5'], 'Profile changes rebuild the distinct source list.');
  sources[0] = { id: 11, count: 1, isPotion: () => true };
  assert.equal(Object.keys(shared.captureContainer(container, sharedBindings)).length, 5, 'Returning to a previous profile reads its current sources.');
} finally {
  potionConfigModule.getPotionCatalog = previousCatalogGetter;
  potionConfigModule.getPotionConfigByItemId = previousItemGetter;
}
assert.deepEqual(buildItemAttachments([], resolve), {});
// Potion slots need not begin at container index zero.
const items = [null, null, { id: 11, count: 3, isPotion: () => true }, null, { id: 12, count: 1, isPotion: () => true }];
const belt = { isContainer: () => true, container: { peekIndex: index => items[index] }, getPotionSlotCount: () => 3, getPotionSlotIndex: index => index + 2 };
const hotbar = new BeltHotbarState();
assert.equal(buildItemAttachments(hotbar.capture(belt), resolve).belt3.appearance.primary, 0x0000FF);
items[2] = null;
assert.equal(buildItemAttachments(hotbar.capture(belt), resolve).belt1, undefined);

const values = [undefined, colorAppearance(0xFF0000), colorAppearance(0x123456, 0xABCDEF), materialAppearance(7, 0x123456)];
let fullRoundTrips = 0;
const target = new Uint8Array(256); let written = 0;
const writer = { writeUInt8(value) { target[written++] = value; }, writeUInt16(value) { this.writeUInt8(value); this.writeUInt8(value >>> 8); } };
const outfitSlots = Array.from({ length: 10 }, () => ({ id: 0 }));
for (let mask = 0; mask < 128; mask++) for (const appearance of values) {
  const entries = Object.fromEntries(ATTACHMENT_POINTS.slice(0, 7).flatMap((point, index) => mask & (1 << index) ? [[point, { attachmentId: 1 + index, appearance }]] : []));
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
  assert.deepEqual(applyAttachmentUpdates(before.attachments, delta.attachmentUpdates), next.attachments);
  assert.equal(reader.index, packet.buffer.length);
}
// Shared update helper preserves backpack points and skips quantity-only changes.
let publications = 0; let current = after;
const properties = { getProperty: () => current, setProperty: (_key, value) => { current = value; publications++; } };
CreatureProperties.prototype.updateOutfitAttachments.call(properties, { belt2: after.attachments.belt2 });
assert.equal(publications, 0);
CreatureProperties.prototype.updateOutfitAttachments.call(properties, { belt1: null, belt2: null, belt3: null });
assert.equal(publications, 1); assert.ok(current.attachments.backpackLeft); assert.equal(current.attachments.belt2, undefined);
assert.throws(() => cloneAttachments({ healthPotion: 1, bag: 1 }), /Invalid attachment/, 'Only canonical attachment records are accepted.');

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
assert.throws(() => readAttachments(new PacketReader(new Uint8Array([1,1,0,0]))), /Invalid attachment/);
async function verifyEquipmentLifecycle() {
  const Equipment = require('../../Emperia-Server/src/game/core/item/equipment.ts').default;
  const { getPotionCatalog } = require('../../Emperia-Server/src/game/core/item/potion-config.ts');
  const healthConfig = getPotionCatalog().configs.find(config => config.definition.recovery[0]?.resource === 'health');
  const manaConfig = getPotionCatalog().configs.find(config => config.definition.recovery[0]?.resource === 'mana');
  const health = healthConfig.definition.itemId;
  const mana = manaConfig.definition.itemId;
  const potion = (id, count = 1) => ({ id, count, isPotion: () => true });
  const heldItems = [null, null, potion(health, 2), potion(health), potion(mana)];
  let equippedBelt = { isContainer: () => true, container: { peekIndex: index => heldItems[index] }, getPotionSlotCount: () => 3, getPotionSlotIndex: index => index + 2 };
  let outfit = new ServerOutfit({ id: 128, attachments: { backpackLeft: { attachmentId: 4 } } });
  let appearances = 0, hotbarSends = 0;
  const properties = { getProperty: () => outfit, setProperty: (_key, value) => { outfit = value; appearances++; } };
  properties.updateOutfitAttachments = updates => CreatureProperties.prototype.updateOutfitAttachments.call(properties, updates);
  properties.replaceOutfitAttachmentsForOwner = (owner, next) => CreatureProperties.prototype.replaceOutfitAttachmentsForOwner.call(properties, owner, next);
  const backpackPrototype = { properties: { 295: [{ point: 'backpackLeft', attachmentId: 4 }] } };
  const equipment = Object.create(Equipment.prototype);
  Object.assign(equipment, { __retired: false, __beltHotbarState: new BeltHotbarState(), __player: { properties, io: { sendBeltHotbarSlots: () => hotbarSends++ } }, peekIndex: index => index === require('../../Emperia-Server/src/platform/config/constants.ts').CONST.EQUIPMENT.BACKPACK ? { getPrototype: () => backpackPrototype } : equippedBelt });
  equipment.notifyBeltContentsChanged(); equipment.notifyBeltContentsChanged(); await Promise.resolve();
  assert.equal(appearances, 1); assert.equal(hotbarSends, 1, 'same mutation batch publishes once');
  assert.equal(outfit.attachments.belt2.attachmentId, 4);
  heldItems[2].count = 1; equipment.notifyBeltContentsChanged(); await Promise.resolve();
  assert.equal(appearances, 1, 'quantity changes keep the same rendered attachment');
  heldItems[2] = null; equipment.notifyBeltContentsChanged(); await Promise.resolve();
  assert.equal(outfit.attachments.belt1, undefined, 'last potion removes its attachment');
  heldItems[3] = potion(mana); heldItems[4] = potion(health); equipment.notifyBeltContentsChanged(); await Promise.resolve();
  assert.deepEqual(outfit.attachments.belt2.appearance, manaConfig.attachmentAppearance); assert.deepEqual(outfit.attachments.belt3.appearance, healthConfig.attachmentAppearance);
  equippedBelt = null; equipment.notifyBeltContentsChanged(); await Promise.resolve();
  assert.deepEqual(outfit.attachments, { backpackLeft: { attachmentId: 4 } }, 'unequipping belt keeps independent backpack attachments');
  const sends = hotbarSends;
  equipment.notifyBeltContentsChanged(); equipment.retire(); await Promise.resolve();
  assert.equal(hotbarSends, sends, 'retired equipment does not publish delayed changes');
}
verifyEquipmentLifecycle().then(() => console.log(JSON.stringify({ fullRoundTrips, formatVersion: EOBJ_FORMAT_VERSION, verified: ['74/75/76 preserved', 'duplicate potion types', 'physical hotbar positions', 'consumption/reorder/unequip/retirement', 'backpack preservation', 'full and delta packets', 'mask pixels', 'shared textures', 'all asset readers'] }, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
