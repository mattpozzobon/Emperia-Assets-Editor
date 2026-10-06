const assert = require('node:assert/strict');
require('../../Emperia-Client/scripts/test-support/register-client-typescript.cjs');
const { writeOutfitSlot, getOutfitSlotWireSize } = require('../../Emperia-Server/src/platform/protocol/serialization/outfit-wire-format.ts');
const { readOutfitColors } = require('../../Emperia-Client/client/src/engine/network/outfit-color-codec.ts');
const flags = require('../../Emperia-Server/src/platform/protocol/generated/protocol-contract.generated.ts');
const clientFlags = require('../../Emperia-Client/client/src/engine/network/protocol-contract.generated.ts');
assert.equal(flags.ENTITY_UPDATE_PROTOCOL_VERSION, clientFlags.ENTITY_UPDATE_PROTOCOL_VERSION);
const { paletteAppearance, paletteColors } = require("../../Emperia-Server/src/shared/appearance.ts");
const colorsList = [undefined];
for (const primary of [0,22,132]) for (const secondary of [0,58,132]) colorsList.push({primary,secondary});
for(const colors of colorsList) for(const metadata of [false,true]) {
 const appearance=colors?paletteAppearance(colors.primary,colors.secondary):undefined;
 const slot={id:321,appearance,...(metadata?{rarity:2,level:8,directAppearance:true}:{})};
 const bytes=[];
 writeOutfitSlot({writeUInt8:x=>bytes.push(x&255),writeUInt16:x=>bytes.push(x&255,(x>>>8)&255)},slot);
 assert.equal(bytes.length,getOutfitSlotWireSize(slot));
 let offset=3;
 const reader={readUInt8:()=>{assert.ok(offset<bytes.length);return bytes[offset++];}};
 const decoded=bytes[2]&flags.OUTFIT_SLOT_FLAG_COLORS?readOutfitColors(reader,bytes[2]):undefined;
 assert.deepEqual(decoded,paletteColors(appearance));
 if(metadata) assert.deepEqual(bytes.slice(offset),[2,8]); else assert.equal(offset,bytes.length);
}
assert.equal(getOutfitSlotWireSize({id:1,appearance:paletteAppearance(82,0)}),5);
assert.equal(getOutfitSlotWireSize({id:1,appearance:paletteAppearance(82,48)}),5);
assert.equal(getOutfitSlotWireSize({id:1,appearance:paletteAppearance(82,82)}),4);
console.log('Verified two-channel server/client wire round-trips, metadata boundaries, and 5/4-byte slot sizes.');
