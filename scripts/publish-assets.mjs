import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EDITOR_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_ROOT = resolve(process.env.EMPERIA_CLIENT_ROOT || join(EDITOR_ROOT, '..', 'Emperia-Client'));
const ASSET_PACKAGE_ROOT = resolve(
  process.env.EMPERIA_ASSET_ROOT || join(EDITOR_ROOT, '..', 'Emperia-Assets', 'current'),
);
const DATA_ROOT = join(CLIENT_ROOT, 'client', 'data');
const RELEASE_MANIFEST_FILE = join(DATA_ROOT, 'asset-manifest.json');
const PACKAGE_MANIFEST_FILE = join(ASSET_PACKAGE_ROOT, 'asset-package.json');
const UPLOAD_STATE_FILE = join(EDITOR_ROOT, '.r2-upload-manifest.json');
const LEGACY_UPLOAD_STATE_FILE = join(CLIENT_ROOT, '.r2-upload-manifest.json');
const WRANGLER_CLI = join(EDITOR_ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const BUCKET = 'emperia-assets/data';
const RELEASE_MANIFEST_KEY = `${BUCKET}/asset-manifest.json`;
const PACKAGE_MANIFEST_KEY = `${BUCKET}/asset-package.json`;
const MAX_PARALLEL_UPLOADS = 4;
const SPRITE_RUNTIME_FILES = new Set(['emperia.eobj', 'emperia.espr']);
const ITEM_CATALOG_RUNTIME_FILES = new Set([
  'item-catalog.en.json',
  'item-catalog.pt.json',
  'item-catalog.es.json',
  'item-catalog.pl.json',
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readJson(filename, label) {
  if (!existsSync(filename)) throw new Error(`${label} not found: ${filename}`);
  try {
    return JSON.parse(readFileSync(filename, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function loadAssetPackageManifest() {
  const manifest = readJson(PACKAGE_MANIFEST_FILE, 'Asset package manifest');
  if (manifest.schemaVersion !== 1 || !manifest.files || !manifest.packageId) {
    throw new Error(`Invalid shared asset package manifest: ${PACKAGE_MANIFEST_FILE}`);
  }
  return manifest;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const absolute = join(dir, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) yield* walk(absolute);
    else yield absolute;
  }
}

function shouldPublish(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
  const parts = normalized.split('/');
  if (normalized === 'asset-manifest.json' || normalized.endsWith('version.json')) return false;
  if (parts.includes('backup') || normalized.endsWith('.crswap')) return false;
  return parts[0] === 'world-map';
}

function generateRuntimeAssetManifest(packageManifest) {
  const assets = {};
  const sourceFiles = new Map();
  for (const filename of [...SPRITE_RUNTIME_FILES, ...ITEM_CATALOG_RUNTIME_FILES]) {
    const absolute = join(ASSET_PACKAGE_ROOT, filename);
    if (!existsSync(absolute)) throw new Error(`Shared asset package is missing ${filename}: ${absolute}`);
    const bytes = readFileSync(absolute);
    const entry = { sha256: sha256(bytes), size: bytes.byteLength };
    const declared = packageManifest.files[filename];
    if (!declared || declared.sha256 !== entry.sha256 || declared.size !== entry.size) {
      throw new Error(`Shared asset package is inconsistent for ${filename}. Compile the package again.`);
    }
    const logicalPath = SPRITE_RUNTIME_FILES.has(filename)
      ? `sprites/${filename}`
      : `localization/${filename}`;
    assets[logicalPath] = entry;
    sourceFiles.set(logicalPath, absolute);
  }

  const worldMapRoot = join(DATA_ROOT, 'world-map');
  if (!existsSync(worldMapRoot)) throw new Error(`Client world map not found: ${worldMapRoot}`);
  for (const absolute of walk(worldMapRoot)) {
    const logicalPath = relative(DATA_ROOT, absolute).replace(/\\/g, '/');
    if (!shouldPublish(logicalPath)) continue;
    const bytes = readFileSync(absolute);
    assets[logicalPath] = { sha256: sha256(bytes), size: bytes.byteLength };
    sourceFiles.set(logicalPath, absolute);
  }

  const releaseInput = Object.entries(assets)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, entry]) => `${path}:${entry.sha256}:${entry.size}`)
    .join('\n');
  const release = sha256(releaseInput);
  const manifest = { schemaVersion: 1, release, assets };
  writeFileSync(RELEASE_MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, sourceFiles };
}

function runClientScript(script) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [join(CLIENT_ROOT, 'scripts', script)], {
      cwd: CLIENT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(
        `${script} failed (${signal ? `signal ${signal}` : `exit ${code}`}): ${output.trim()}`,
      ));
    });
  });
}

function putObject(key, file, cacheControl) {
  return new Promise((resolveUpload, rejectUpload) => {
    const child = spawn(process.execPath, [
      WRANGLER_CLI, 'r2', 'object', 'put', key,
      '--file', file,
      '--remote',
      '--force',
      '--cache-control', cacheControl,
    ], { cwd: EDITOR_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', rejectUpload);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveUpload();
      else rejectUpload(new Error(
        `Wrangler upload failed for ${key} (${signal ? `signal ${signal}` : `exit ${code}`}): ${output.trim()}`,
      ));
    });
  });
}

async function uploadInParallel(pendingUploads) {
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < pendingUploads.length) {
      const upload = pendingUploads[nextIndex++];
      await putObject(upload.key, upload.file, 'public, max-age=31536000, immutable');
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(MAX_PARALLEL_UPLOADS, pendingUploads.length) },
    () => worker(),
  ));
}

function stageImmutableUploads(uploads) {
  const stagingDir = mkdtempSync(join(tmpdir(), 'emperia-asset-upload-'));
  try {
    const stagedUploads = uploads.map((upload, index) => {
      const bytes = readFileSync(upload.file);
      const actualHash = sha256(bytes);
      if (bytes.byteLength !== upload.entry.size || actualHash !== upload.entry.sha256) {
        throw new Error(`${upload.logicalPath} changed while the CDN upload was being prepared.`);
      }
      const stagedFile = join(stagingDir, `${index}-${basename(upload.file)}`);
      writeFileSync(stagedFile, bytes);
      return { ...upload, file: stagedFile };
    });
    return { stagingDir, uploads: stagedUploads };
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

export async function publishAssets(options = {}) {
  if (!existsSync(WRANGLER_CLI)) throw new Error(`Wrangler is not installed in Assets Editor: ${WRANGLER_CLI}`);
  await runClientScript('sync-world-map.mjs');
  await runClientScript('validate-world-map.mjs');

  const packageManifest = loadAssetPackageManifest();
  if (options.expectedPackageId && packageManifest.packageId !== options.expectedPackageId) {
    throw new Error(
      `The compiled package (${options.expectedPackageId.slice(0, 12)}) does not match `
      + `the canonical CDN source (${packageManifest.packageId.slice(0, 12)}) at ${ASSET_PACKAGE_ROOT}.`,
    );
  }
  const { manifest: releaseManifest, sourceFiles } = generateRuntimeAssetManifest(packageManifest);
  const stateFile = existsSync(UPLOAD_STATE_FILE) ? UPLOAD_STATE_FILE : LEGACY_UPLOAD_STATE_FILE;
  const previous = existsSync(stateFile) ? readJson(stateFile, 'R2 upload state') : {};
  const previousAssets = previous.assets && typeof previous.assets === 'object' ? previous.assets : previous;
  const previousPackageFiles = previous.packageFiles && typeof previous.packageFiles === 'object'
    ? previous.packageFiles
    : {};

  const pendingUploads = [];
  let skippedObjects = 0;
  for (const [logicalPath, entry] of Object.entries(releaseManifest.assets)) {
    if (previousAssets[logicalPath] === entry.sha256 || previousAssets[logicalPath]?.sha256 === entry.sha256) {
      skippedObjects += 1;
      continue;
    }
    pendingUploads.push({
      logicalPath,
      entry,
      key: `${BUCKET}/objects/${entry.sha256}/${basename(logicalPath)}`,
      file: sourceFiles.get(logicalPath),
    });
  }
  for (const [filename, entry] of Object.entries(packageManifest.files)) {
    if (previousPackageFiles[filename] === entry.sha256 || previousPackageFiles[filename]?.sha256 === entry.sha256) {
      skippedObjects += 1;
      continue;
    }
    pendingUploads.push({
      logicalPath: `package/${filename}`,
      entry,
      key: `${BUCKET}/objects/${entry.sha256}/${filename}`,
      file: join(ASSET_PACKAGE_ROOT, filename),
    });
  }

  const uniqueUploads = Array.from(new Map(pendingUploads.map((upload) => [upload.key, upload])).values());
  const uploadedBytes = uniqueUploads.reduce((total, upload) => total + upload.entry.size, 0);
  const staged = stageImmutableUploads(uniqueUploads);
  try {
    await uploadInParallel(staged.uploads);
    await putObject(RELEASE_MANIFEST_KEY, RELEASE_MANIFEST_FILE, 'no-store');
    await putObject(PACKAGE_MANIFEST_KEY, PACKAGE_MANIFEST_FILE, 'no-store');
    writeFileSync(UPLOAD_STATE_FILE, `${JSON.stringify({
      release: releaseManifest.release,
      assets: releaseManifest.assets,
      packageId: packageManifest.packageId,
      packageFiles: packageManifest.files,
    }, null, 2)}\n`);
  } finally {
    rmSync(staged.stagingDir, { recursive: true, force: true });
  }

  return {
    bucket: BUCKET,
    release: releaseManifest.release,
    packageId: packageManifest.packageId,
    changedObjects: uniqueUploads.length,
    skippedObjects,
    uploadedBytes,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await publishAssets();
    console.log(`EMPERIA_PUBLISH_RESULT=${JSON.stringify(result)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
