const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
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
const sprites = Array.from({length:9}, (_,i)=>({id:300+i, colors:{primary:22+i,secondary:i%2?58:22+i}, rarity:2,level:8,materialId:7,materialComposition:0x123456}));
let cases = 0;
for (let mask=0;mask<512;mask++) for(let extras=0;extras<32;extras++) for(const renderHelmet of [false,true]) {
 const outfit={id:134, renderHelmet, sprites, attachments:{healthPotion:extras&1?1:0,manaPotion:extras&2?2:0,energyPotion:extras&4?3:0,bag:extras&8?255:0},lightSourceItemId:extras&16?65535:0};
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
  assert.equal(i===0?slot.sourceHairId:slot.sourceItemId,sprites[i].id);
  assert.deepEqual(slot.colors,sprites[i].colors);
  assert.equal(slot.rarity,2);assert.equal(slot.level,8);
  assert.equal(slot.materialId,7);assert.equal(slot.materialComposition,0x123456);
 });
 cases++;
}
const empty={id:134,renderHelmet:true,sprites:sprites.map(()=>({id:0})),attachments:{healthPotion:0,manaPotion:0,energyPotion:0,bag:0},lightSourceItemId:0};
written=read=0;writeOutfit(writer,empty);assert.equal(written,4);assert.equal(proto.readOutfit.call(reader).sprites.filter(s=>s.id).length,0);
assert.deepEqual(Array.from(bytes.subarray(0,4)),[134,0,0,2]);
bytes[3]|=0x80;read=0;assert.throws(()=>proto.readOutfit.call(reader),/Unsupported outfit header/);
const sparse={...empty,sprites:empty.sprites.map((s,i)=>i===8?{id:65535,directAppearance:true}:s)};
written=read=0;writeOutfit(writer,sparse);
assert.equal(written,getOutfitWireSize(sparse));
assert.equal(proto.readOutfit.call(reader).sprites[8].sourceVisualEquipmentId,65535);
assert.equal(read,written);
written=0;writeOutfit(writer,sparse,0);assert.equal(written,4);

// Optional exact RGB dye must survive every metadata/colour combination.
for (const maskPrimary of [undefined, 0, 0xFFFFFF, 1, 0x123456, 0xFF0000, 0xFFFFFE])
 for (const colors of [undefined, {primary:22, secondary:22}, {primary:22, secondary:58}])
 for (const metadata of [false,true]) for(const maskSecondary of [undefined,0,0xABCDEF,maskPrimary]) {
  const slot = { id:321, maskPrimary, maskSecondary, colors, ...(metadata ? {rarity:2,level:8,materialId:7,materialComposition:0x123456} : {}) };
  const outfit = {...empty, sprites:empty.sprites.map((s,i)=>i===1?slot:s)};
  written=read=0; writeOutfit(writer,outfit);
  assert.equal(written,getOutfitWireSize(outfit));
  const size=written; writer.writeUInt16(0xBEEF);
  const decoded=proto.readOutfit.call(reader).sprites[1];
  assert.equal(decoded.maskPrimary,maskPrimary && maskPrimary!==0xFFFFFF ? maskPrimary : undefined);
  assert.equal(decoded.maskSecondary,maskSecondary != null && maskSecondary !== (maskPrimary ?? 0xFFFFFF) ? maskSecondary : undefined);
  if(colors) assert.deepEqual(decoded.colors,colors);
  assert.equal(read,size); assert.equal(reader.readUInt16(),0xBEEF);
 }

function oldWrite(writer,outfit,mask=511) {
 writer.writeUInt16(outfit.id);writer.writeUInt8(Number(outfit.renderHelmet));
 let slots=0;for(let i=0;i<9;i++)if((mask&(1<<i))&&outfit.sprites[i].id>0)slots|=1<<i;
 writer.writeUInt16(slots);
 for(let i=0;i<9;i++)if(slots&(1<<i))writeOutfitSlot(writer,outfit.sprites[i]);
 const a=outfit.attachments;writer.writeUInt8(a.healthPotion);writer.writeUInt8(a.manaPotion);writer.writeUInt8(a.energyPotion);writer.writeUInt8(a.bag);writer.writeUInt16(outfit.lightSourceItemId);
}
const typical={...empty,sprites:sprites.map((s,i)=>i<5?{id:s.id,colors:s.colors}:{id:0})};
const dense={...empty,sprites,attachments:{healthPotion:1,manaPotion:2,energyPotion:3,bag:4},lightSourceItemId:100};
const examples=[empty,typical,dense].map((outfit,i)=>{
 written=0;oldWrite(writer,outfit);const before=written;written=0;writeOutfit(writer,outfit);
 return {name:['empty','five-coloured-pieces','all-slots-and-extras'][i],before,after:written};
});
function benchmark(fn) {
 const times=[];let checksum=0;
 for(let run=0;run<7;run++) {
  const start=performance.now();
  for(let i=0;i<100000;i++){written=0;fn(writer,i%3===0?empty:i%3===1?typical:dense);checksum+=written;}
  if(run>1)times.push(performance.now()-start);
 }
 times.sort((a,b)=>a-b);assert.ok(checksum>0);return Number(times[2].toFixed(2));
}
console.log(JSON.stringify({roundTrips:cases,examples,medianMsPer100k:{old:benchmark(oldWrite),compact:benchmark(writeOutfit)}},null,2));
