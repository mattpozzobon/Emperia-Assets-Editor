const {colorAppearance, paletteAppearance, materialAppearance} = (()=>{require("../../Emperia-Client/scripts/test-support/register-client-typescript.cjs"); return require("../../Emperia-Server/src/shared/appearance.ts");})();
const assert = require('node:assert/strict');
const { ATTACHMENT_POINTS } = require('../../Emperia-Server/src/shared/attachments.ts');
const attachmentValues = mask => Object.fromEntries(ATTACHMENT_POINTS.slice(0, 4).flatMap((point, index) => mask & (1 << index) ? [[point, {visualEquipmentId: 800 + index, appearance: paletteAppearance(88 + index)}]] : []));
require('../../Emperia-Client/scripts/test-support/register-client-typescript.cjs');
const { writeOutfit, writeOutfitSlot, getOutfitWireSize } = require('../../Emperia-Server/src/platform/protocol/serialization/outfit-wire-format.ts');
const { applyItemAppearanceReaders } = require('../../Emperia-Client/client/src/engine/network/readers/item-appearance-readers.ts');
const proto = {};
applyItemAppearanceReaders(proto);
const bytes = new Uint8Array(256);
let written = 0, read = 0;
const writer = {
 writeUInt8(value) { bytes[written++] = value; },
 writeUInt16(value) { bytes[written++] = value; bytes[written++] = value >>> 8; },
};
const reader = {
 readUInt8() { assert.ok(read < written, 'Overread'); return bytes[read++]; },
 readUInt16() { return this.readUInt8() | this.readUInt8() << 8; },
};
const sprites = Array.from({length:10}, (_,i)=>({id:300+i, appearance:i%3===0?materialAppearance(7,0x123456):paletteAppearance(22+i,i%2?58:22+i), rarity:2,level:8}));
let cases = 0;
for (let mask=0;mask<1024;mask++) for(let extras=0;extras<32;extras++) for(const renderHelmet of [false,true]) {
 const outfit={id:134, renderHelmet, sprites, attachments:attachmentValues(extras),lightSourceItemId:extras&16?65535:0};
 written=read=0;
 writeOutfit(writer,outfit,mask);
 assert.equal(written,getOutfitWireSize(outfit,mask));
 const size=written;
 writer.writeUInt16(0xBEEF);
 const result=proto.readOutfit.call(reader);
 assert.equal(read,size);
 assert.equal(reader.readUInt16(),0xBEEF);
 assert.equal(result.id,outfit.id);
 assert.equal(result.renderHelmet,renderHelmet);
 assert.deepEqual(result.attachments,outfit.attachments);
 assert.equal(result.lightSourceItemId,outfit.lightSourceItemId);
 result.sprites.forEach((slot,i)=>{
  if(!(mask&(1<<i))) {assert.equal(slot.id,0);return;}
  assert.equal(i===0?slot.sourceHairId:i===9?slot.sourceBeardId:slot.sourceItemId,sprites[i].id);
  assert.deepEqual(slot.appearance,sprites[i].appearance);
  assert.equal(slot.rarity,2);assert.equal(slot.level,8);
 });
 cases++;
}
const empty={id:134,renderHelmet:true,sprites:sprites.map(()=>({id:0})),attachments:{},lightSourceItemId:0};
written=read=0;writeOutfit(writer,empty);assert.equal(written,4);assert.equal(proto.readOutfit.call(reader).sprites.filter(s=>s.id).length,0);
assert.deepEqual(Array.from(bytes.subarray(0,4)),[134,0,0,4]);
const sparse={...empty,sprites:empty.sprites.map((s,i)=>i===8?{id:65535,directAppearance:true}:s)};
written=read=0;writeOutfit(writer,sparse);
assert.equal(written,getOutfitWireSize(sparse));
assert.equal(proto.readOutfit.call(reader).sprites[8].sourceVisualEquipmentId,65535);
assert.equal(read,written);
written=0;writeOutfit(writer,sparse,0);assert.equal(written,4);

// Both exclusive branches, exact RGB and palette compaction preserve boundaries.
for (const appearance of [undefined, materialAppearance(7), materialAppearance(7,0x123456),
  ...[0,1,0xFFFFFF,0x123456,0xFF0000,0xFFFFFE].flatMap(primary =>
    [primary,0,0xFFFFFF,0xABCDEF].map(secondary => colorAppearance(primary,secondary)))])
 for (const metadata of [false,true]) {
  const slot = {id:321,appearance,...(metadata?{rarity:2,level:8}:{})};
  const outfit = {...empty, sprites:empty.sprites.map((s,i)=>i===1?slot:s)};
  written=read=0;writeOutfit(writer,outfit);assert.equal(written,getOutfitWireSize(outfit));
  const size=written;writer.writeUInt16(0xBEEF);
  assert.deepEqual(proto.readOutfit.call(reader).sprites[1].appearance,appearance);
  assert.equal(read,size);assert.equal(reader.readUInt16(),0xBEEF);
 }

const examples = [empty, {...empty,sprites}, {...empty,sprites,attachments:attachmentValues(15)}].map((outfit, index) => {
 written=0;writeOutfit(writer,outfit);return {name:['empty','ten-pieces','ten-pieces-four-attachments'][index],bytes:written};
});
console.log(JSON.stringify({roundTrips:cases,examples},null,2));
