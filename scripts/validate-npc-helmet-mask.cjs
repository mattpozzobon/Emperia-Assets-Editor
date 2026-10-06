const assert = require('node:assert/strict');
const fs = require('node:fs'), zlib = require('node:zlib');
require('../../Emperia-Client/scripts/test-support/register-client-typescript.cjs');
global.ImageData=class {constructor(data,width,height){this.width=typeof data==='number'?data:width;this.height=typeof data==='number'?width:height;this.data=typeof data==='number'?new Uint8ClampedArray(this.width*this.height*4):data;}};
global.document={createElement:()=>({getContext:()=>({})})};
const { parseObjectData } = require('../src/lib/object-parser.ts');
const { parseSpriteData, decodeSprite } = require('../src/lib/sprite-decoder.ts');
const { hasOutfitMask } = require('../../Emperia-Client/client/src/shared/utils/rendering/outfit-mask-presence.ts');
const { applyAppearancePixels } = require('../../Emperia-Client/client/src/shared/utils/rendering/appearance-renderer.ts');
const { iterateOutfitPrecacheTasks } = require('../../Emperia-Client/client/src/renderer/creatures/creature-sprite-precache-tasks.ts');
function read(name) {
 let bytes=fs.readFileSync('../Emperia-Assets/current/'+name);
 if(bytes[0]===31) bytes=zlib.gunzipSync(bytes);
 return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
}
const data=parseObjectData(read('emperia.eobj')), sprites=parseSpriteData(read('emperia.espr'));
const marcus=JSON.parse(fs.readFileSync('../Emperia-Server/data/npcs/definitions/ironwake/banker/outfit.json','utf8'));
const helmet=marcus.sprites[1];assert.equal(helmet.id,145);assert.equal(helmet.appearance.kind,'color');
const equipment=[...data.things.values()].filter(t=>t.category==='equipment');
const thing=equipment[helmet.id];assert.deepEqual(thing.colorMaskSources,[0,1]);
let changed=0, compared=0;
for(const raw of thing.frameGroups) {
 const group={...raw,colorMaskSources:thing.colorMaskSources};
 assert.ok(hasOutfitMask(group,false,0),'helmet colour masks must compose despite the old unmasked-slot default');
 const tiles=group.width*group.height;
 for(let start=0;start<group.sprites.length;start+=tiles*group.layers) for(let tile=0;tile<tiles;tile++) {
  const base=decodeSprite(sprites,group.sprites[start+tile]).data;
  const mask=decodeSprite(sprites,group.sprites[start+tiles+tile]).data;
  const result=new Uint8ClampedArray(base);
  applyAppearancePixels(result,mask,helmet.appearance,32);
  for(let i=0;i<base.length;i+=4) {
   assert.equal(result[i+3],base[i+3]);
   if(mask[i]===255&&mask[i+1]===255&&mask[i+2]===0&&mask[i+3]===255&&base[i+3]) {
    const rgb=helmet.appearance.primary;
    assert.deepEqual(result.slice(i,i+3),new Uint8ClampedArray([base[i]*(rgb>>>16)/255,base[i+1]*(rgb>>>8&255)/255,base[i+2]*(rgb&255)/255]));
    if(result[i]!==base[i]||result[i+1]!==base[i+1]||result[i+2]!==base[i+2]) changed++;
   } else assert.deepEqual(result.slice(i,i+4),base.slice(i,i+4),'white secondary and unmasked pixels stay unchanged');
   compared++;
  }
 }
}
assert.ok(changed>0);
const group={width:1,height:1,layers:2,animationLength:1,colorMaskSources:[0,1],getSpriteId:(_f,_x,_y,_z,layer)=>layer?202:101};
const mockOutfit={id:132,sprites:Array.from({length:9},(_,i)=>({id:i===1?145:0})),attachments:{},getSpriteData:()=>({frameGroups:[group],getFrameGroup:()=>group})};
const tasks=[...iterateOutfitPrecacheTasks(mockOutfit,{getOutfit:()=>null,getEquipmentMaterialMaskLayer:()=>0})];
assert.ok(tasks.length>0);assert.ok(tasks.every(task=>task.maskId===202&&task.colorSlot===1),'helmet preload must include the colour-mask layer');
assert.equal(hasOutfitMask({layers:2},false,0),false,'ordinary multi-layer decorations remain raw');
assert.equal(hasOutfitMask({layers:1,colorMaskSources:[0]},false,0),false);
console.log(JSON.stringify({npc:'Marcus',helmet:145,primary:'#'+helmet.appearance.primary.toString(16),changedMaskPixels:changed,comparedPixels:compared,precacheMask:'verified'}));
