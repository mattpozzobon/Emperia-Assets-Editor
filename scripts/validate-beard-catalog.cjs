const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../../Emperia-Client/scripts/test-support/register-client-typescript.cjs');
const { parseObjectData } = require('../src/lib/object-parser.ts');
const { compileObjectData } = require('../src/lib/object-writer.ts');
const ObjectBuffer = require('../../Emperia-Client/client/src/engine/core/object-buffer.ts').default;
const { parseVisualCatalog } = require('../../Emperia-Server/src/game/core/creature/visual-catalog.ts');
const { shouldRenderBeard } = require('../../Emperia-Client/client/src/renderer/creatures/creature-head-appearance.ts');
const { decodeRustClientCommand } = require('../../Emperia-Server/src/platform/protocol/generated/rust-client-command-decoder.generated.ts');
const { Outfit, SlotKey } = require('../../Emperia-Server/src/game/core/creature/player/outfit.ts');
const { getAppearanceDeltaMask } = require('../../Emperia-Server/src/platform/protocol/packets/entities/creature-packets.ts');
const { AppearanceDeltaFlag } = require('../../Emperia-Server/src/platform/protocol/generated/protocol-contract.generated.ts');
const { PlayerOutfitSchema } = require('../../Emperia-Server/src/platform/persistence/schemas/player-outfit.ts');
const { OutfitSchema } = require('../../Emperia-Server/src/platform/data/schemas/outfit-schema.ts');
const { normalizeNPCStatistics } = require('../../Emperia-Server/src/game/core/creature/npc/npc.ts');
const { VISUAL_CATALOG } = require('../../Emperia-Server/src/game/core/creature/visual-catalog.ts');
const { parseObjects } = require('../../Emperia-Data-Editor/src/game-preview-assets.ts');

const source = fs.readFileSync(path.resolve(__dirname, '../../Emperia-Assets/current/emperia.eobj'));
const original = parseObjectData(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
const hair = [...original.things.values()].find(thing => thing.category === 'hair');
assert.ok(hair, 'sample asset must contain a hair appearance');
const beardAppearanceId = original.itemCount + original.outfitCount + original.equipmentCount
  + original.hairCount + original.effectCount + original.distanceCount + original.beardCount + 1;
const newBeardId = Math.max(0, ...original.beardDefinitions.keys()) + 1;
const newAppearanceId = original.beardCount;
original.beardCount++;
original.things.set(beardAppearanceId, { ...hair, id: beardAppearanceId, category: 'beard' });
original.beardDefinitions.set(newBeardId, {
  beardId: newBeardId, appearanceId: newAppearanceId, name: 'Test Beard',
  races: 1, genders: 1, tiers: 1, sortOrder: 0,
});
const bytes = compileObjectData(original);
const reparsed = parseObjectData(bytes);
assert.equal(reparsed.formatVersion, 17);
assert.equal(reparsed.beardCount, newAppearanceId + 1);
assert.equal(reparsed.beardDefinitions.get(newBeardId)?.name, 'Test Beard');
assert.equal(reparsed.things.get(beardAppearanceId)?.category, 'beard');

const client = new ObjectBuffer();
client.__load('beard-test.eobj', bytes);
assert.equal(client.getBeardAppearance(newBeardId), newAppearanceId + 1);
assert.ok(client.getBeardDefinitions().some(beard => beard.beardId === newBeardId));
assert.ok(client.getBeard(newAppearanceId + 1));
const npcAssets = parseObjects(new Uint8Array(bytes));
assert.ok(npcAssets.beardIds.includes(newBeardId));
assert.ok(npcAssets.beard(newBeardId));
const serverCatalog = parseVisualCatalog(Buffer.from(bytes));
assert.equal(serverCatalog.beardById.get(newBeardId)?.name, 'Test Beard');
assert.equal(shouldRenderBeard(true, 42, false), true, 'helmet keeps beard');
assert.equal(shouldRenderBeard(true, 42, true), false, 'mask hides beard');
assert.equal(shouldRenderBeard(false, 42, true), true, 'hidden mask keeps beard');
assert.equal(decodeRustClientCommand(Buffer.from([5, 0x40, 7, 0]))?.payload?.beardId, 7);
assert.equal(decodeRustClientCommand(Buffer.from([5, 0x40, 7])), null);
const before = new Outfit();
const after = before.copy();
after.sprites[SlotKey.Beard] = { id: 1 };
assert.equal(getAppearanceDeltaMask(before, after), AppearanceDeltaFlag.Beard);
assert.equal(PlayerOutfitSchema.parse({ beard: { id: 1 } }).sprites[SlotKey.Beard].id, 1);
const npcSprites = Array.from({ length: 10 }, (_, index) => ({ id: index === SlotKey.Beard ? 1 : 0 }));
assert.equal(OutfitSchema.parse({ id: 134, sprites: npcSprites }).sprites[SlotKey.Beard].id, 1);
const liveBeardId = VISUAL_CATALOG.beards[0]?.beardId;
assert.ok(liveBeardId, 'current assets need a beard to verify NPC normalization');
const headItemId = VISUAL_CATALOG.equipmentItemIds.values().next().value;
const normalized = normalizeNPCStatistics({ outfit: { id: 134, sprites: Array.from({ length: 10 }, (_, index) => ({
  id: index === SlotKey.Beard ? liveBeardId : index === SlotKey.Head ? headItemId : 0,
})) } });
assert.equal(normalized.outfit.sprites[SlotKey.Beard].id, liveBeardId, 'NPC beard survives head equipment');
assert.equal(normalized.outfit.sprites[SlotKey.Head].id, headItemId);
const invalid = normalizeNPCStatistics({ outfit: { sprites: Array.from({ length: 10 }, (_, index) => ({
  id: index === SlotKey.Beard ? 65535 : 0,
})) } });
assert.equal(invalid.outfit.sprites[SlotKey.Beard].id, 0, 'unknown NPC beard is rejected');
console.log('Verified EOBJ v17 beard catalog and appearance in all editors, client, and server.');
