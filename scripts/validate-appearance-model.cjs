const assert=require('node:assert/strict');
require('../../Emperia-Client/scripts/test-support/register-client-typescript.cjs');
const server=require('../../Emperia-Server/src/shared/appearance.ts');
const client=require('../../Emperia-Client/client/src/engine/domain/appearance.ts');
const {AppearanceSchema}=require('../../Emperia-Server/src/platform/data/schemas/appearance-schema.ts');
const {PlayerOutfitSchema}=require('../../Emperia-Server/src/platform/persistence/schemas/player-outfit.ts');
const {OutfitSchema}=require('../../Emperia-Server/src/platform/data/schemas/outfit-schema.ts');
const {Outfit}=require('../../Emperia-Server/src/game/core/creature/player/outfit.ts');
const {applyPlayerEquipmentToOutfit}=require('../../Emperia-Client/client/src/engine/domain/outfit-catalog.ts');
const ClientOutfit=require('../../Emperia-Client/client/src/engine/domain/outfit.ts').default;
for(let p=0;p<133;p++) for(const secondary of [0,p,132]) {
 const before={primary:p,secondary};
 const expected=server.paletteAppearance(p,secondary,true);
 const restored=PlayerOutfitSchema.parse({hair:{id:904,colors:before}});
 assert.deepEqual(restored.sprites[0].appearance,expected);
 assert.deepEqual(PlayerOutfitSchema.parse({hair:{id:904,appearance:expected}}).sprites[0].appearance,expected);
 assert.deepEqual(client.paletteAppearance(p,secondary,true),expected);
}
for(const appearance of [server.colorAppearance(0x123456),server.colorAppearance(0,0xABCDEF),server.materialAppearance(10,0x1203)]) {
 assert.deepEqual(AppearanceSchema.parse(appearance),appearance);
 const outfit=new Outfit({id:134,sprites:[{id:1,appearance}]});
 assert.ok(outfit.isValid());assert.deepEqual(outfit.copy().sprites[0].appearance,appearance);
 assert.deepEqual(OutfitSchema.parse(outfit.toJSON()).sprites[0].appearance,appearance);
}
assert.equal(AppearanceSchema.safeParse({kind:'color',primary:1,materialId:10}).success,false);
assert.equal(AppearanceSchema.safeParse({kind:'material',materialId:10,primary:1}).success,false);
assert.equal(server.colorAppearance(0xFFFFFF),undefined);
assert.deepEqual(server.colorAppearance(123,123),{kind:'color',primary:123});
const outfit=new ClientOutfit();const equipment=[null,{id:5918,rarity:0,level:1,appearance:server.colorAppearance(0x2F80ED)}];
applyPlayerEquipmentToOutfit(outfit,equipment,null);
assert.equal(outfit.sprites[2].appearance,equipment[1].appearance,'local equipment shares the item-owned appearance');
assert.equal('colors' in outfit.sprites[2],false);
assert.equal('maskPrimary' in outfit.sprites[2],false);
assert.equal('materialId' in outfit.sprites[2],false);
console.log('Verified shared appearance contract, 399 old/new hair save round-trips, exclusive schemas and item-owned player appearance.');
