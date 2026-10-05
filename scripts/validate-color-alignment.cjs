const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
if (!process.argv[3] && fs.existsSync(path.join(path.resolve(process.argv[2] ?? '../Emperia-Assets/current'), 'model-migration.json'))) {
 require('./validate-primary-secondary-model.cjs');
 process.exit(0);
}

require('../../Emperia-Client/scripts/test-support/register-client-typescript.cjs');
global.document = {createElement:()=>({getContext:()=>null})};
global.ImageData = class {constructor(data,width,height){ this.width=typeof data==='number'?data:width;this.height=typeof data==='number'?width:height;this.data=typeof data==='number'?new Uint8ClampedArray(this.width*this.height*4):data; }};
const {parseObjectData} = require('../src/lib/object-parser.ts');
const {parseSpriteData,decodeSprite} = require('../src/lib/sprite-decoder.ts');
const {parseObjects} = require('../../Emperia-Data-Editor/src/game-preview-assets.ts');
const {resolveColorRegionPalette,buildColorMaskSpriteSources} = require('./legacy-color-mask-regions.ts');
const {tintOutfitMask} = require('./legacy-mask-tinter.ts');
const target = path.resolve(process.argv[2]);
const reportName=process.argv[3] ?? (fs.existsSync(path.join(target,'two-color-mask-migration.json')) ? 'two-color-mask-migration.json' : 'color-mask-migration.json');
const report=JSON.parse(fs.readFileSync(path.join(target,reportName)));
const buffer=(root,name)=>{let b=fs.readFileSync(path.join(root,name));if(b[0]===31&&b[1]===139)b=zlib.gunzipSync(b);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
const oldObjects=parseObjectData(buffer(report.originalAssetBackup??report.source,'emperia.eobj'));
const newBytes=buffer(target,'emperia.eobj');
const newObjects=parseObjectData(newBytes);
const dataEditor=parseObjects(new Uint8Array(newBytes));
const oldSprites=parseSpriteData(buffer(report.originalAssetBackup??report.source,'emperia.espr'));
const newSprites=parseSpriteData(buffer(target,'emperia.espr'));
const registry=buildColorMaskSpriteSources(Array.from(newObjects.things.values(), thing => ({frameGroups:thing.frameGroups.map(group => ({...group,colorMaskSources:thing.colorMaskSources}))})));
const merged = report.mergePolicy === 'legacy-green-blue-to-yellow-red-stays-red';
if (merged) {
 for (const thing of newObjects.things.values()) assert.ok(!thing.colorMaskSources || thing.colorMaskSources.length <= 2, `Too many regions: ${thing.id}`);
 const migratedIds = new Set(report.appearances.map(a => a.appearanceId));
 for (const [id, before] of oldObjects.things) {
  if (migratedIds.has(id)) continue;
  const after = newObjects.things.get(id);
  assert.deepEqual(after.frameGroups, before.frameGroups, `Unrelated appearance ${id} changed`);
  for (const group of before.frameGroups) for (const spriteId of group.sprites) {
   if (spriteId) assert.deepEqual(decodeSprite(newSprites,spriteId)?.data,decodeSprite(oldSprites,spriteId)?.data);
  }
 }
}
let tested=0;
for(const appearance of report.appearances){
 const before=oldObjects.things.get(appearance.appearanceId),after=newObjects.things.get(appearance.appearanceId);
 assert.deepEqual(dataEditor.colorMaskSources.get(after.id),after.colorMaskSources);
 for(let g=0;g<before.frameGroups.length;g++){
  const a=before.frameGroups[g],b=after.frameGroups[g],tiles=a.width*a.height;
  for(let i=0;i<a.sprites.length;i++){
   if(Math.floor(i/tiles)%a.layers!==1){assert.equal(a.sprites[i],b.sprites[i]);continue;}
   if(!a.sprites[i])continue;
   const oldMask=decodeSprite(oldSprites,a.sprites[i]),newMask=decodeSprite(newSprites,b.sprites[i]);
   if (merged) {
    const originalRGB = [0xFFFF00,0xFF0000,0x00FF00,0x0000FF];
    const sources = before.colorMaskSources ?? [0,1,2,3];
    for (let p=0;p<oldMask.data.length;p+=4) {
     const rgb = (oldMask.data[p]<<16)|(oldMask.data[p+1]<<8)|oldMask.data[p+2];
     const channel = originalRGB.indexOf(rgb);
     const expected = channel >= 0 && oldMask.data[p+3] === 255 ? (sources[channel] === 1 ? 0xFF0000 : 0xFFFF00) : rgb;
     const actual = (newMask.data[p]<<16)|(newMask.data[p+1]<<8)|newMask.data[p+2];
     assert.equal(actual, expected, `Appearance ${after.id}: incorrect mask conversion`);
     assert.equal(newMask.data[p+3],oldMask.data[p+3]);
    }
   }
   for(const equipmentRgb of [false,true]){
    const legacy=[0x123456,0x789ABC,0x13579B,0x2468AC];
    const regions=resolveColorRegionPalette(legacy,registry.get(b.sprites[i]));
    const x=new Uint8ClampedArray(4096).fill(219),y=new Uint8ClampedArray(x);
    const oldRegions=merged
      ? [0,1,2,3].map(index => (before.colorMaskSources ?? [0,1,2,3])[index] === 1 ? legacy[1] : legacy[after.colorMaskSources[0]])
      : resolveColorRegionPalette(legacy,before.colorMaskSources);
    tintOutfitMask(x,oldMask.data,...oldRegions,equipmentRgb);
    tintOutfitMask(y,newMask.data,...regions,equipmentRgb);
    assert.deepEqual(y,x,`Appearance ${after.id}, sprite ${a.sprites[i]}, RGB=${equipmentRgb}`);
    tested++;
   }
  }
 }
}
process.env.EMPERIA_ASSET_ROOT=target;
const {VISUAL_CATALOG}=require('../../Emperia-Server/src/game/core/creature/visual-catalog.ts');
assert.ok(VISUAL_CATALOG.hairs.length>0);
console.log(JSON.stringify({appearanceMappings:report.appearances.length,pixelComparisons:tested,serverHairs:VISUAL_CATALOG.hairs.length,dataEditorMappings:dataEditor.colorMaskSources.size}));
