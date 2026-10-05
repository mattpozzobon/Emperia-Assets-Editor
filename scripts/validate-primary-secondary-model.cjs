const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
require('../../Emperia-Client/scripts/test-support/register-client-typescript.cjs');
global.document = {createElement:()=>({getContext:()=>null})};
global.ImageData = class { constructor(data,width,height) {this.width=typeof data==='number'?data:width;this.height=typeof data==='number'?width:height;this.data=typeof data==='number'?new Uint8ClampedArray(this.width*this.height*4):data;} };
const {parseObjectData}=require('../src/lib/object-parser.ts');
const {parseSpriteData,decodeSprite}=require('../src/lib/sprite-decoder.ts');
const {parseObjects}=require('../../Emperia-Data-Editor/src/game-preview-assets.ts');
const {tintOutfitMask}=require('../../Emperia-Client/client/src/renderer/assets/outfit-mask-tinter.ts');
const {PlayerOutfitSchema}=require('../../Emperia-Server/src/platform/persistence/schemas/player-outfit.ts');
const {OutfitSchema}=require('../../Emperia-Server/src/platform/data/schemas/outfit-schema.ts');
const root=path.resolve(process.argv[2] ?? '../Emperia-Assets/current');
const read=name=>{let b=fs.readFileSync(path.join(root,name));if(b[0]===31&&b[1]===139)b=zlib.gunzipSync(b);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
const bytes=read('emperia.eobj'),objects=parseObjectData(bytes),sprites=parseSpriteData(read('emperia.espr'));
const dataEditor=parseObjects(new Uint8Array(bytes));
let appearances=0, comparisons=0, savedColors=0;
for(const thing of objects.things.values()) {
 if(!thing.colorMaskSources)continue;
 appearances++;
 assert.ok(thing.colorMaskSources.length<=2);
 assert.deepEqual(thing.colorMaskSources,thing.colorMaskSources.map((_,i)=>i));
 assert.deepEqual(dataEditor.colorMaskSources.get(thing.id),thing.colorMaskSources);
 for(const group of thing.frameGroups) for(let i=0;i<group.sprites.length;i++) {
  if(Math.floor(i/(group.width*group.height))%group.layers!==1 || !group.sprites[i])continue;
  const mask=decodeSprite(sprites,group.sprites[i]);
  const words=new Uint32Array(mask.data.buffer,mask.data.byteOffset,mask.data.length/4);
  assert.ok(!words.includes(0xFF00FF00)&&!words.includes(0xFFFF0000),`Old channel in ${thing.id}`);
  for(const rgb of [true,false]) {
   const actual=new Uint8ClampedArray(mask.data.length).fill(200),expected=new Uint8ClampedArray(actual);
   tintOutfitMask(actual,mask.data,0x123456,0xABCDEF,rgb);
   for(let pixel=0;pixel<words.length;pixel++) {
    const color=words[pixel]===0xFF00FFFF?0x123456:words[pixel]===0xFF0000FF?0xABCDEF:null;
    if(color===null)continue;
    for(let c=0;c<3;c++)expected[pixel*4+c]=200*((color>>((rgb?2-c:c)*8))&255)/255;
   }
   assert.deepEqual(actual,expected);comparisons++;
  }
 }
}
function check(value) {
 if(!value||typeof value!=='object')return;
 if(Array.isArray(value.sprites)) {
  OutfitSchema.parse(value);
  for(const slot of value.sprites) if(slot.colors) {assert.deepEqual(Object.keys(slot.colors).sort(),['primary','secondary']);savedColors++;}
 }
 for(const child of Object.values(value))check(child);
}
function scan(dir) {for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else if(file.endsWith('.json'))check(JSON.parse(fs.readFileSync(file,'utf8')));}}
scan(path.resolve('../Emperia-Server/data'));
for(const value of Object.values(require('../../Emperia-Server/src/game/systems/tutorial/tutorial-outfits.ts')))check(value);
const saved=PlayerOutfitSchema.parse({hair:{id:904,colors:{primary:114,secondary:0}}});
assert.deepEqual(saved.sprites[0].colors,{primary:114,secondary:0});
assert.equal(PlayerOutfitSchema.safeParse({hair:{colors:{yellow:114,red:0,green:0,blue:0}}}).success,false);
process.env.EMPERIA_ASSET_ROOT=root;
assert.ok(require('../../Emperia-Server/src/game/core/creature/visual-catalog.ts').VISUAL_CATALOG.hairs.length);
console.log(JSON.stringify({appearances,comparisons,savedColors,model:'primary-secondary'}));
