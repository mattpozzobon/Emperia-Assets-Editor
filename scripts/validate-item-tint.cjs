const assert=require('node:assert/strict');
const fs=require('node:fs'),zlib=require('node:zlib');
require('../../Emperia-Client/scripts/test-support/register-client-typescript.cjs');
global.ImageData=class{constructor(d,w,h){this.width=typeof d==='number'?d:w;this.height=typeof d==='number'?w:h;this.data=typeof d==='number'?new Uint8ClampedArray(this.width*this.height*4):d;}};
global.document={createElement(){const canvas={};canvas.getContext=()=>({drawImage(source){canvas.pixels=new Uint8ClampedArray(source.pixels);},getImageData(){return {data:canvas.pixels};},putImageData(data){canvas.pixels=data.data;}});return canvas;}};
const {parseObjectData}=require('../src/lib/object-parser.ts');
const {parseSpriteData,decodeSprite}=require('../src/lib/sprite-decoder.ts');
const {getItemMaterialMaskAppearance,getItemMaterialMaskTexture}=require('../../Emperia-Client/client/src/shared/utils/rendering/item-material-mask-texture.ts');
const {applyWorldWriters}=require('../../Emperia-Server/src/platform/protocol/writers/world-writers.ts');
const {applyItemAppearanceReaders}=require('../../Emperia-Client/client/src/engine/network/readers/item-appearance-readers.ts');
const ServerItem=require('../../Emperia-Server/src/game/core/item/item.ts').default;
const {ThingFactory}=require('../../Emperia-Server/src/platform/data/thing-factory.ts');
const runtime={getThingPrototype:()=>({properties:{},isStackable:()=>false}),createThing:id=>new ServerItem(id,runtime)};
const saved=ThingFactory.prototype.parseThing.call(runtime,{id:5918,count:0,instanceProperties:{260:0x2F80ED}});
const writer={},reader={};applyWorldWriters(writer);applyItemAppearanceReaders(reader);
const bytes=[];writer.writeUInt8=x=>bytes.push(x&255);writer.writeUInt16=x=>bytes.push(x&255,x>>>8&255);
writer.writeVarUInt=x=>{do{let b=x&127;x>>>=7;bytes.push(b|(x?128:0));}while(x);};
writer.writeItem(saved);let offset=0;
reader.readUInt8=()=>bytes[offset++];reader.readUInt16=()=>reader.readUInt8()|reader.readUInt8()<<8;
const decoded=reader.readItem();assert.equal(decoded.maskPrimary,0x2F80ED);assert.equal(offset,bytes.length);
const {Texture}=require('../../Emperia-Client/node_modules/pixi.js');
const originalFrom=Texture.from;
Texture.from=canvas=>({source:{},pixels:canvas.pixels});
function read(name){let b=fs.readFileSync('../Emperia-Assets/current/'+name);if(b[0]===31)b=zlib.gunzipSync(b);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}
try {
 const objects=parseObjectData(read('emperia.eobj')),sprites=parseSpriteData(read('emperia.espr'));
 const thing=objects.things.get(objects.itemAppearances.get(5918));
 assert.deepEqual(thing.colorMaskSources,[0]);
 const group=thing.frameGroups[0];assert.equal(group.layers,2);
 const base=decodeSprite(sprites,group.sprites[0]).data;
 const mask=decodeSprite(sprites,group.sprites[group.width*group.height]).data;
 const texture=pixels=>({frame:{x:0,y:0,width:32,height:32},source:{resource:{pixels}}});
 const appearance=getItemMaterialMaskAppearance(decoded);
 const output=getItemMaterialMaskTexture(texture(base),texture(mask),appearance).pixels;
 let changed=0;
 for(let i=0;i<base.length;i+=4){
  assert.equal(output[i+3],base[i+3]);
  if(mask[i]===255&&mask[i+1]===255&&mask[i+2]===0&&mask[i+3]===255){
   const expected=new Uint8ClampedArray([base[i]*47/255,base[i+1]*128/255,base[i+2]*237/255]);
   assert.deepEqual(output.slice(i,i+3),expected);if(base[i+3]&&output[i]!==base[i])changed++;
  }else assert.deepEqual(output.slice(i,i+4),base.slice(i,i+4));
 }
 assert.ok(changed>0);
 console.log(JSON.stringify({item:5918,maskPrimary:'#2F80ED',changedMaskPixels:changed,unmaskedPixelsPreserved:true}));
}finally{Texture.from=originalFrom;}
