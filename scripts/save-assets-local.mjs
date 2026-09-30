import { createHash, randomUUID } from 'node:crypto';
import {
  copyFile,
  mkdir,
  open,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const OBSOLETE_PACKAGE_FILES = ['items.otb', 'items.xml'];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function assertSafeArtifactName(name) {
  if (typeof name !== 'string' || name.length === 0 || basename(name) !== name) {
    throw new Error(`Invalid asset artifact name: ${String(name)}`);
  }
}

async function exists(filename) {
  try {
    await stat(filename);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function copyInPlace(source, destination) {
  const input = await readFile(source);
  let handle;
  try {
    handle = await open(destination, 'w');
    await handle.writeFile(input);
    await handle.sync();
  } finally {
    await handle?.close();
  }
}

async function verifyFile(filename, expected) {
  const actual = await readFile(filename);
  if (actual.length !== expected.length || sha256(actual) !== sha256(expected)) {
    throw new Error(`Write verification failed for ${basename(filename)}.`);
  }
}

export async function saveAssetsLocally({ assetRoot, artifacts }) {
  const root = resolve(assetRoot);
  if (basename(root).toLowerCase() !== 'current') {
    throw new Error(`Local asset save is restricted to a folder named "current": ${root}`);
  }
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    throw new Error('No compiled artifacts were provided.');
  }

  const names = new Set();
  for (const artifact of artifacts) {
    assertSafeArtifactName(artifact.name);
    if (names.has(artifact.name)) throw new Error(`Duplicate asset artifact: ${artifact.name}`);
    names.add(artifact.name);
    if (!Buffer.isBuffer(artifact.buffer)) throw new Error(`Invalid payload for ${artifact.name}`);
    if (artifact.sha256 !== sha256(artifact.buffer)) {
      throw new Error(`Upload checksum mismatch for ${artifact.name}`);
    }
  }

  const transactionId = randomUUID();
  const backupRoot = join(root, 'backup');
  await mkdir(backupRoot, { recursive: true });
  const staged = [];
  const committed = [];

  try {
    for (const artifact of artifacts) {
      const target = join(root, artifact.name);
      const temp = join(root, `.${artifact.name}.${transactionId}.emperia-tmp`);
      const backup = join(backupRoot, artifact.name);
      const hadPrevious = await exists(target);
      if (hadPrevious) await copyFile(target, backup);
      await writeFile(temp, artifact.buffer, { flag: 'wx' });
      await verifyFile(temp, artifact.buffer);
      staged.push({ artifact, target, temp, backup, hadPrevious });
    }

    // The manifest is the commit marker and must become visible last.
    staged.sort((left, right) => Number(left.artifact.name === 'asset-package.json')
      - Number(right.artifact.name === 'asset-package.json'));

    for (const entry of staged) {
      await copyInPlace(entry.temp, entry.target);
      await verifyFile(entry.target, entry.artifact.buffer);
      committed.push(entry);
    }

    for (const obsolete of OBSOLETE_PACKAGE_FILES) {
      await unlink(join(root, obsolete)).catch((error) => {
        if (error?.code !== 'ENOENT') throw error;
      });
    }

    return {
      root,
      files: artifacts.length,
      bytes: artifacts.reduce((total, artifact) => total + artifact.buffer.length, 0),
    };
  } catch (error) {
    const rollbackFailures = [];
    for (const entry of committed.reverse()) {
      try {
        if (entry.hadPrevious) await copyInPlace(entry.backup, entry.target);
        else await unlink(entry.target).catch((unlinkError) => {
          if (unlinkError?.code !== 'ENOENT') throw unlinkError;
        });
      } catch {
        rollbackFailures.push(entry.artifact.name);
      }
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(rollbackFailures.length > 0
      ? `${detail} Rollback failed for: ${rollbackFailures.join(', ')}.`
      : detail);
  } finally {
    await Promise.all(staged.map((entry) => rm(entry.temp, { force: true }).catch(() => undefined)));
  }
}

