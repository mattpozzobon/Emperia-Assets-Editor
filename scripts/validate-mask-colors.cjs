const assert=require('node:assert/strict');
require('../../Emperia-Client/scripts/test-support/register-client-typescript.cjs');
const {getItemWireValues,getItemWireValuesSize,writeItemWireValues,writeFixedItemSemanticValues,writeFixedItemSemanticWire,getFixedItemSemanticWireSize,FIXED_ITEM_SEMANTIC_BYTES}=require('../../Emperia-Server/src/platform/protocol/serialization/item-wire-format.ts');
const {applyWorldWriters}=require('../../Emperia-Server/src/platform/protocol/writers/world-writers.ts');
const {applyItemAppearanceReaders}=require('../../Emperia-Client/client/src/engine/network/readers/item-appearance-readers.ts');
const Item=require('../../Emperia-Server/src/game/core/item/item.ts').default;
const {ItemAttr}=require('../../Emperia-Server/src/game/core/thing/item-attributes.ts');
const {ThingFactory}=require('../../Emperia-Server/src/platform/data/thing-factory.ts');
const runtime={getThingPrototype:()=>({properties:{},isStackable:()=>false}),createThing:id=>new Item(id,runtime)};
const proto={};applyItemAppearanceReaders(proto);
let cases=0;
for(const primary of [undefined,0,1,0x123456,0xFFFFFF])
for(const secondary of [undefined,0,1,0xABCDEF,0xFFFFFF,primary])
for(const material of [0,10]) {
 const attributes={};if(primary!=null)attributes[260]=primary;if(secondary!=null)attributes[265]=secondary;
 if(material)attributes[ItemAttr.MaterialId]=material;
 const item=ThingFactory.prototype.parseThing.call(runtime,{id:5918,count:0,instanceProperties:attributes});
 const saved=JSON.parse(JSON.stringify(item));
 const restored=ThingFactory.prototype.parseThing.call(runtime,saved);
 const value=getItemWireValues(restored),size=getItemWireValuesSize(value);
 const wire=Buffer.alloc(size);assert.equal(writeItemWireValues(wire,0,value),size);
 const fixed=Buffer.alloc(FIXED_ITEM_SEMANTIC_BYTES);
 assert.equal(writeFixedItemSemanticValues(fixed,0,value),fixed.length);
 assert.equal(getFixedItemSemanticWireSize(fixed,0),size);
 const fixedWire=Buffer.alloc(size);assert.equal(writeFixedItemSemanticWire(fixed,0,fixedWire,0),size);assert.deepEqual(fixedWire,wire);
 const bytes=[],writer={};applyWorldWriters(writer);
 writer.writeUInt8=x=>bytes.push(x&255);writer.writeUInt16=x=>bytes.push(x&255,x>>>8&255);
 writer.writeItem(item);assert.deepEqual(Buffer.from(bytes),wire);
 const all=Buffer.concat([wire,Buffer.from([0xef,0xbe])]);let offset=0;
 const reader={...proto,readUInt8:()=>all[offset++],readUInt16(){return this.readUInt8()|this.readUInt8()<<8;}};
 const decoded=reader.readItem();
 assert.deepEqual(decoded.appearance,item.getAppearance());
 assert.equal(value.materialId,decoded.appearance?.kind==='material'?material:0);
 assert.equal(restored.getAttribute(ItemAttr.MaterialId)||0,material,'crafting material survives even when colour mode is rendered');
 assert.equal(offset,size);assert.equal(reader.readUInt16(),0xBEEF);
 cases++;
}
console.log(JSON.stringify({maskColourSaveAndWireRoundTrips:cases,fixedSemanticBytes:FIXED_ITEM_SEMANTIC_BYTES}));
