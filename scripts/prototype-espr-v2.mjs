import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const MAGIC = Buffer.from('EMPERIA\0', 'ascii');
const HEADER_SIZE = 20;
const SPRITE_PIXELS = 32 * 32;

const MODE = {
  EMPTY: 0,
  PALETTE_RLE: 1,
  RGB_RLE: 2,
  RGBA_RLE: 3,
};

const MODE_NAMES = ['empty', 'palette-rle', 'rgb-rle', 'rgba-rle'];

function usage() {
  console.log('Usage: npm run prototype:espr-v2 -- [input.espr] [--pages] [--output candidate.espr2]');
  console.log('The input defaults to C:/Dev/Emperia-Assets/current/emperia.espr.');
}

function parseArguments(argv) {
  let input = 'C:/Dev/Emperia-Assets/current/emperia.espr';
  let output = null;
  let pages = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      usage();
      process.exit(0);
    }
    if (argument === '--output') {
      output = argv[++index];
      if (!output) throw new Error('--output requires a filename');
      continue;
    }
    if (argument === '--pages') {
      pages = true;
      continue;
    }
    if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`);
    input = argument;
  }

  return { input: path.resolve(input), output: output ? path.resolve(output) : null, pages };
}

function maybeGunzip(buffer) {
  return buffer[0] === 0x1f && buffer[1] === 0x8b
    ? zlib.gunzipSync(buffer)
    : buffer;
}

function parseSpriteFile(buffer) {
  if (buffer.length < HEADER_SIZE + 4 || !buffer.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('The prototype currently requires an Emperia ESPR file.');
  }
  if (buffer.readUInt8(8) !== 0x01) throw new Error('The input is not an ESPR file.');

  const contentVersion = buffer.readUInt32LE(11);
  const spriteCount = contentVersion > 760
    ? buffer.readUInt32LE(HEADER_SIZE)
    : buffer.readUInt16LE(HEADER_SIZE);
  const countSize = contentVersion > 760 ? 4 : 2;
  const tableOffset = HEADER_SIZE + countSize;
  const addresses = new Uint32Array(spriteCount);

  for (let index = 0; index < spriteCount; index += 1) {
    addresses[index] = buffer.readUInt32LE(tableOffset + index * 4);
  }

  return { buffer, contentVersion, spriteCount, addresses };
}

function decodeV1Sprite(file, spriteIndex) {
  const address = file.addresses[spriteIndex];
  const pixels = Buffer.alloc(SPRITE_PIXELS * 4);
  if (address === 0) return pixels;
  if (address + 5 > file.buffer.length) throw new Error(`Sprite ${spriteIndex + 1} has an invalid address.`);

  const payloadSize = file.buffer.readUInt16LE(address + 3);
  const payloadEnd = address + 5 + payloadSize;
  if (payloadEnd > file.buffer.length) throw new Error(`Sprite ${spriteIndex + 1} exceeds the ESPR payload.`);

  let source = address + 5;
  let pixel = 0;
  while (source < payloadEnd) {
    if (source + 4 > payloadEnd) throw new Error(`Sprite ${spriteIndex + 1} has a truncated RLE run.`);
    const skip = file.buffer.readUInt16LE(source);
    const run = file.buffer.readUInt16LE(source + 2);
    source += 4;
    pixel += skip;
    if (pixel + run > SPRITE_PIXELS || source + run * 4 > payloadEnd) {
      throw new Error(`Sprite ${spriteIndex + 1} has invalid RLE bounds.`);
    }
    file.buffer.copy(pixels, pixel * 4, source, source + run * 4);
    source += run * 4;
    pixel += run;
  }

  return pixels;
}

function collectRuns(pixels) {
  const runs = [];
  let cursor = 0;

  while (cursor < SPRITE_PIXELS) {
    let skip = 0;
    while (cursor + skip < SPRITE_PIXELS && pixels[(cursor + skip) * 4 + 3] === 0) skip += 1;
    const start = cursor + skip;
    let run = 0;
    while (start + run < SPRITE_PIXELS && pixels[(start + run) * 4 + 3] !== 0) run += 1;
    if (run === 0) break;
    runs.push({ skip, start, run });
    cursor = start + run;
  }

  return runs;
}

function colorKey(pixels, offset) {
  return (
    pixels[offset]
    | (pixels[offset + 1] << 8)
    | (pixels[offset + 2] << 16)
    | (pixels[offset + 3] << 24)
  ) >>> 0;
}

function paletteFor(pixels) {
  const colors = [];
  const indices = new Map();
  let opaqueAlpha = true;
  let paletteOverflow = false;

  for (let pixel = 0; pixel < SPRITE_PIXELS; pixel += 1) {
    const offset = pixel * 4;
    const alpha = pixels[offset + 3];
    if (alpha === 0) continue;
    if (alpha !== 255) opaqueAlpha = false;
    if (paletteOverflow) continue;
    const color = colorKey(pixels, offset);
    if (!indices.has(color)) {
      if (colors.length === 256) {
        paletteOverflow = true;
        continue;
      }
      indices.set(color, colors.length);
      colors.push(color);
    }
  }

  return {
    colors: paletteOverflow ? null : colors,
    indices: paletteOverflow ? null : indices,
    opaqueAlpha,
  };
}

function encodeRgbaRuns(pixels, runs) {
  const size = runs.reduce((total, entry) => total + 4 + entry.run * 4, 0);
  const payload = Buffer.allocUnsafe(size);
  let offset = 0;
  for (const entry of runs) {
    payload.writeUInt16LE(entry.skip, offset);
    payload.writeUInt16LE(entry.run, offset + 2);
    offset += 4;
    pixels.copy(payload, offset, entry.start * 4, (entry.start + entry.run) * 4);
    offset += entry.run * 4;
  }
  return payload;
}

function encodeRgbRuns(pixels, runs) {
  const size = runs.reduce((total, entry) => total + 4 + entry.run * 3, 0);
  const payload = Buffer.allocUnsafe(size);
  let offset = 0;
  for (const entry of runs) {
    payload.writeUInt16LE(entry.skip, offset);
    payload.writeUInt16LE(entry.run, offset + 2);
    offset += 4;
    for (let pixel = entry.start; pixel < entry.start + entry.run; pixel += 1) {
      const source = pixel * 4;
      payload[offset++] = pixels[source];
      payload[offset++] = pixels[source + 1];
      payload[offset++] = pixels[source + 2];
    }
  }
  return payload;
}

function encodePaletteRuns(pixels, runs, colors, indices) {
  const runSize = runs.reduce((total, entry) => total + 4 + entry.run, 0);
  const payload = Buffer.allocUnsafe(2 + colors.length * 4 + runSize);
  payload.writeUInt16LE(colors.length, 0);
  let offset = 2;
  for (const color of colors) {
    payload.writeUInt32LE(color, offset);
    offset += 4;
  }
  for (const entry of runs) {
    payload.writeUInt16LE(entry.skip, offset);
    payload.writeUInt16LE(entry.run, offset + 2);
    offset += 4;
    for (let pixel = entry.start; pixel < entry.start + entry.run; pixel += 1) {
      payload[offset++] = indices.get(colorKey(pixels, pixel * 4));
    }
  }
  return payload;
}

function encodeV2Sprite(pixels) {
  const runs = collectRuns(pixels);
  if (runs.length === 0) return { mode: MODE.EMPTY, payload: Buffer.alloc(0), paletteSize: 0 };

  const palette = paletteFor(pixels);
  const candidates = [{ mode: MODE.RGBA_RLE, payload: encodeRgbaRuns(pixels, runs), paletteSize: 0 }];
  if (palette.opaqueAlpha) {
    candidates.push({ mode: MODE.RGB_RLE, payload: encodeRgbRuns(pixels, runs), paletteSize: 0 });
  }
  if (palette.colors && palette.indices) {
    candidates.push({
      mode: MODE.PALETTE_RLE,
      payload: encodePaletteRuns(pixels, runs, palette.colors, palette.indices),
      paletteSize: palette.colors.length,
    });
  }

  candidates.sort((left, right) => left.payload.length - right.payload.length);
  return candidates[0];
}

function decodeV2Sprite(record) {
  const pixels = Buffer.alloc(SPRITE_PIXELS * 4);
  if (record.mode === MODE.EMPTY) return pixels;

  let offset = 0;
  let palette = null;
  if (record.mode === MODE.PALETTE_RLE) {
    const count = record.payload.readUInt16LE(offset);
    offset += 2;
    palette = new Uint32Array(count);
    for (let index = 0; index < count; index += 1) {
      palette[index] = record.payload.readUInt32LE(offset);
      offset += 4;
    }
  }

  let pixel = 0;
  while (offset < record.payload.length) {
    const skip = record.payload.readUInt16LE(offset);
    const run = record.payload.readUInt16LE(offset + 2);
    offset += 4;
    pixel += skip;
    for (let index = 0; index < run; index += 1) {
      const target = (pixel + index) * 4;
      if (record.mode === MODE.PALETTE_RLE) {
        const color = palette[record.payload[offset++]];
        pixels.writeUInt32LE(color, target);
      } else {
        pixels[target] = record.payload[offset++];
        pixels[target + 1] = record.payload[offset++];
        pixels[target + 2] = record.payload[offset++];
        pixels[target + 3] = record.mode === MODE.RGB_RLE ? 255 : record.payload[offset++];
      }
    }
    pixel += run;
  }

  return pixels;
}

function recordBuffer(record) {
  const result = Buffer.allocUnsafe(5 + record.payload.length);
  result.writeUInt8(record.mode, 0);
  result.writeUInt32LE(record.payload.length, 1);
  record.payload.copy(result, 5);
  return result;
}

function buildCandidate(file) {
  const records = [];
  const modeCounts = new Uint32Array(MODE_NAMES.length);
  const paletteHistogram = { upTo16: 0, upTo32: 0, upTo64: 0, upTo128: 0, upTo256: 0 };
  let recordsSize = 0;

  for (let spriteIndex = 0; spriteIndex < file.spriteCount; spriteIndex += 1) {
    const original = decodeV1Sprite(file, spriteIndex);
    const encoded = encodeV2Sprite(original);
    const decoded = decodeV2Sprite(encoded);
    if (!original.equals(decoded)) {
      let differingByte = 0;
      while (original[differingByte] === decoded[differingByte]) differingByte += 1;
      throw new Error(
        `Sprite ${spriteIndex + 1} failed the lossless round-trip in ${MODE_NAMES[encoded.mode]} mode `
        + `at byte ${differingByte}: expected ${original[differingByte]}, received ${decoded[differingByte]}.`,
      );
    }

    const record = recordBuffer(encoded);
    records.push(record);
    recordsSize += record.length;
    modeCounts[encoded.mode] += 1;

    if (encoded.paletteSize > 0) {
      if (encoded.paletteSize <= 16) paletteHistogram.upTo16 += 1;
      else if (encoded.paletteSize <= 32) paletteHistogram.upTo32 += 1;
      else if (encoded.paletteSize <= 64) paletteHistogram.upTo64 += 1;
      else if (encoded.paletteSize <= 128) paletteHistogram.upTo128 += 1;
      else paletteHistogram.upTo256 += 1;
    }
  }

  const tableOffset = HEADER_SIZE + 4;
  const recordsOffset = tableOffset + file.spriteCount * 4;
  const candidate = Buffer.allocUnsafe(recordsOffset + recordsSize);
  file.buffer.copy(candidate, 0, 0, HEADER_SIZE);
  candidate.writeUInt16LE(2, 9); // Prototype ESPR format version.
  candidate.writeUInt32LE(file.spriteCount, HEADER_SIZE);

  let offset = recordsOffset;
  for (let index = 0; index < records.length; index += 1) {
    candidate.writeUInt32LE(offset, tableOffset + index * 4);
    records[index].copy(candidate, offset);
    offset += records[index].length;
  }

  return { candidate, modeCounts, paletteHistogram };
}

function mb(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

function percentSmaller(candidate, baseline) {
  return Number(((1 - candidate / baseline) * 100).toFixed(1));
}

function clearTransparentRgb(pixels) {
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] !== 0) continue;
    pixels[offset] = 0;
    pixels[offset + 1] = 0;
    pixels[offset + 2] = 0;
  }
  return pixels;
}

async function evaluateImagePages(file, baselineBytes) {
  const { default: sharp } = await import('sharp');
  const spritesPerRow = 32;
  const spritesPerPage = spritesPerRow * spritesPerRow;
  const dimension = spritesPerRow * 32;
  const pageCount = Math.ceil(file.spriteCount / spritesPerPage);
  let pngBytes = 0;
  let webpBytes = 0;

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = Buffer.alloc(dimension * dimension * 4);
    const firstSprite = pageIndex * spritesPerPage;
    const lastSprite = Math.min(file.spriteCount, firstSprite + spritesPerPage);

    for (let spriteIndex = firstSprite; spriteIndex < lastSprite; spriteIndex += 1) {
      const sprite = decodeV1Sprite(file, spriteIndex);
      const localIndex = spriteIndex - firstSprite;
      const spriteX = (localIndex % spritesPerRow) * 32;
      const spriteY = Math.floor(localIndex / spritesPerRow) * 32;
      for (let row = 0; row < 32; row += 1) {
        const sourceStart = row * 32 * 4;
        const targetStart = ((spriteY + row) * dimension + spriteX) * 4;
        sprite.copy(page, targetStart, sourceStart, sourceStart + 32 * 4);
      }
    }

    const image = sharp(page, { raw: { width: dimension, height: dimension, channels: 4 } });
    const png = await image.clone().png({ compressionLevel: 6, adaptiveFiltering: true }).toBuffer();
    const webp = await image.clone().webp({ lossless: true, quality: 100, effort: 3 }).toBuffer();

    const pngRoundTrip = await sharp(png).raw().toBuffer();
    const webpRoundTrip = clearTransparentRgb(await sharp(webp).raw().toBuffer());
    if (!page.equals(pngRoundTrip)) throw new Error(`PNG page ${pageIndex} failed the lossless round-trip.`);
    if (!page.equals(webpRoundTrip)) {
      let differingByte = 0;
      while (page[differingByte] === webpRoundTrip[differingByte]) differingByte += 1;
      throw new Error(
        `WebP page ${pageIndex} failed the lossless round-trip at byte ${differingByte}: `
        + `expected ${page[differingByte]}, received ${webpRoundTrip[differingByte]}.`,
      );
    }
    pngBytes += png.length;
    webpBytes += webp.length;
    process.stderr.write(`\rValidated image page ${pageIndex + 1}/${pageCount}`);
  }
  process.stderr.write('\n');

  // Header plus offset/length pairs. Sprite IDs map arithmetically to page cells.
  const directoryBytes = HEADER_SIZE + 12 + pageCount * 8;
  return {
    pageDimension: `${dimension}x${dimension}`,
    spritesPerPage,
    pageCount,
    png: {
      bytes: pngBytes + directoryBytes,
      mb: mb(pngBytes + directoryBytes),
      reductionVsStoredPercent: percentSmaller(pngBytes + directoryBytes, baselineBytes),
    },
    webpLossless: {
      bytes: webpBytes + directoryBytes,
      mb: mb(webpBytes + directoryBytes),
      reductionVsStoredPercent: percentSmaller(webpBytes + directoryBytes, baselineBytes),
    },
  };
}

const { input, output, pages } = parseArguments(process.argv.slice(2));
const startedAt = performance.now();
const stored = fs.readFileSync(input);
const raw = maybeGunzip(stored);
const file = parseSpriteFile(raw);
const { candidate, modeCounts, paletteHistogram } = buildCandidate(file);
const candidateGzip6 = zlib.gzipSync(candidate, { level: 6 });
const candidateGzip9 = zlib.gzipSync(candidate, { level: 9 });
const currentGzip9 = zlib.gzipSync(raw, { level: 9 });
const imagePages = pages ? await evaluateImagePages(file, stored.length) : null;

if (output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, candidateGzip9);
}

const result = {
  input,
  spriteCount: file.spriteCount,
  losslessValidation: 'passed',
  modes: Object.fromEntries(MODE_NAMES.map((name, index) => [name, modeCounts[index]])),
  paletteDistribution: paletteHistogram,
  sizes: {
    currentStored: { bytes: stored.length, mb: mb(stored.length) },
    currentRaw: { bytes: raw.length, mb: mb(raw.length) },
    currentGzip9: {
      bytes: currentGzip9.length,
      mb: mb(currentGzip9.length),
      reductionVsStoredPercent: percentSmaller(currentGzip9.length, stored.length),
    },
    prototypeRaw: {
      bytes: candidate.length,
      mb: mb(candidate.length),
      reductionVsCurrentRawPercent: percentSmaller(candidate.length, raw.length),
    },
    prototypeGzip6: {
      bytes: candidateGzip6.length,
      mb: mb(candidateGzip6.length),
      reductionVsStoredPercent: percentSmaller(candidateGzip6.length, stored.length),
    },
    prototypeGzip9: {
      bytes: candidateGzip9.length,
      mb: mb(candidateGzip9.length),
      reductionVsStoredPercent: percentSmaller(candidateGzip9.length, stored.length),
    },
  },
  imagePages,
  output,
  elapsedSeconds: Number(((performance.now() - startedAt) / 1000).toFixed(2)),
};

console.log(JSON.stringify(result, null, 2));
