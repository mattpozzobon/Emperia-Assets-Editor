import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { parseObjectData } from '../src/lib/object-parser';
import { compileObjectData } from '../src/lib/object-writer';

const root = path.resolve('../Emperia-Assets/current');
const destination = path.resolve(`../Emperia-Assets/migrations/primary-secondary-model-${Date.now()}`);
const bytes = fs.readFileSync(path.join(root, 'emperia.eobj'));
const objects = parseObjectData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const legacyKeys = ['yellow', 'red', 'green', 'blue'];
const mappings = new Map([...objects.things].map(([id, thing]) => [id, thing.colorMaskSources]));
const equipmentStart = objects.itemCount + objects.outfitCount + 1;
const hairStart = equipmentStart + objects.equipmentCount;
const sourceFor = (slot: any, index: number): number => {
  let absolute: number | undefined;
  if (index === 0) {
    const hair = objects.hairDefinitions.get(slot.id);
    if (hair) absolute = hairStart + hair.appearanceId;
  } else {
    const equipment = objects.equipmentAppearances.get(slot.id);
    const visual = objects.visualEquipmentAppearances.get(slot.id);
    const appearance = slot.directAppearance ? visual?.equipmentAppearanceId ?? slot.id
      : (index === 5 ? equipment?.left : index === 6 ? equipment?.right : undefined) ?? equipment?.default;
    if (appearance != null) absolute = equipmentStart + appearance;
  }
  return (absolute == null ? undefined : mappings.get(absolute)?.[0]) ?? (index === 3 ? 2 : index === 4 ? 3 : 0);
};
let convertedColors = 0;
function migrateOutfit(outfit: any): void {
  const slots = outfit.sprites;
  if (!Array.isArray(slots)) return;
  const original = structuredClone(slots);
  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    if (!slot?.colors || 'primary' in slot.colors) continue;
    const source = sourceFor(slot, index);
    const colors = original[index].colors;
    const primary = colors[legacyKeys[source]] ?? original[source === 2 ? 3 : source === 3 ? 4 : 0]?.colors?.[legacyKeys[source]] ?? original[0]?.colors?.[legacyKeys[source]] ?? 0;
    const secondary = colors.red ?? original[2]?.colors?.red ?? original[0]?.colors?.red ?? 0;
    assert.ok([primary, secondary].every(x => Number.isInteger(x) && x >= 0 && x < 133));
    slot.colors = { primary, secondary };
    convertedColors++;
  }
}
function walk(value: any): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value.sprites)) migrateOutfit(value);
  for (const child of Object.values(value)) walk(child);
}
const edits: { filename: string; content: string }[] = [];
function scan(directory: string): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(filename);
    else if (filename.endsWith('.json')) {
      const source = fs.readFileSync(filename, 'utf8');
      if (!source.includes('"yellow"')) continue;
      const value = JSON.parse(source); const before = convertedColors;
      walk(value);
      if (before !== convertedColors) edits.push({ filename, content: JSON.stringify(value, null, 2) + '\n' });
    }
  }
}
scan(path.resolve('../Emperia-Server/data'));
const tutorial = path.resolve('../Emperia-Server/src/game/systems/tutorial/tutorial-outfits.ts');
const tutorialSource = fs.readFileSync(tutorial, 'utf8');
const tutorialResult = tutorialSource.replace(/(export const \w+ = )(\{[\s\S]*?\n\})(?:;)?/g, (_, prefix, json) => {
  const value = JSON.parse(json); walk(value); return prefix + JSON.stringify(value, null, 2) + ';';
});
if (tutorialResult !== tutorialSource) edits.push({ filename: tutorial, content: tutorialResult });

fs.mkdirSync(destination, { recursive: true });
for (const edit of edits) {
  const backup = path.join(destination, 'source-backup', path.relative(path.resolve('..'), edit.filename));
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(edit.filename, backup);
  fs.writeFileSync(edit.filename, edit.content);
}
for (const thing of objects.things.values()) {
  if (thing.colorMaskSources) thing.colorMaskSources = thing.colorMaskSources.map((_, index) => index);
}
const compiled = new Uint8Array(compileObjectData(objects, new Set()));
const reloaded = parseObjectData(compiled.buffer);
for (const thing of reloaded.things.values()) {
  assert.ok(!thing.colorMaskSources || (thing.colorMaskSources.length <= 2 && thing.colorMaskSources.every((x, i) => x === i)));
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'asset-package.json'), 'utf8'));
for (const name of Object.keys(manifest.files)) {
  if (path.basename(name) !== name) throw Error('Invalid manifest entry');
  fs.copyFileSync(path.join(root, name), path.join(destination, name));
}
fs.writeFileSync(path.join(destination, 'emperia.eobj'), compiled);
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
for (const name of Object.keys(manifest.files)) {
  const data = fs.readFileSync(path.join(destination, name));
  manifest.files[name] = { sha256: hash(data), size: data.byteLength };
}
manifest.generatedAt = new Date().toISOString();
manifest.packageId = hash(Buffer.from(Object.keys(manifest.files).sort().map(name => `${name}:${manifest.files[name].sha256}:${manifest.files[name].size}`).join('\n')));
fs.writeFileSync(path.join(destination, 'asset-package.json'), JSON.stringify(manifest, null, 2) + '\n');
const hairSources = Object.fromEntries([...objects.hairDefinitions].map(([id, hair]) => [id, mappings.get(hairStart + hair.appearanceId)?.[0] ?? 0]));
fs.writeFileSync(path.join(destination, 'model-migration.json'), JSON.stringify({ source: root, sourceObjectsHash: hash(bytes), convertedColors, editedFiles: edits.map(x => x.filename), hairSources }, null, 2));
console.log(JSON.stringify({ destination, convertedColors, editedFiles: edits.length, hairSources }, null, 2));
