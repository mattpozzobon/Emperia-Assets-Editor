import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'

const LOCAL_ASSET_ROOT = resolve(
  process.env.EMPERIA_ASSET_ROOT || resolve(import.meta.dirname, '..', 'Emperia-Assets', 'current'),
)
const MAX_LOCAL_SAVE_BYTES = 128 * 1024 * 1024

async function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += buffer.length
    if (length > MAX_LOCAL_SAVE_BYTES) throw new Error('Compiled asset upload exceeds 128 MiB.')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks, length)
}

function decodeAssetEnvelope(payload: Buffer) {
  if (payload.length < 4) throw new Error('Invalid compiled asset envelope.')
  const headerLength = payload.readUInt32LE(0)
  if (headerLength <= 0 || headerLength > payload.length - 4) {
    throw new Error('Invalid compiled asset envelope header.')
  }
  const header = JSON.parse(payload.subarray(4, 4 + headerLength).toString('utf8')) as {
    version?: number
    artifacts?: Array<{ name: string; size: number; sha256: string }>
  }
  if (header.version !== 1 || !Array.isArray(header.artifacts)) {
    throw new Error('Unsupported compiled asset envelope.')
  }
  let offset = 4 + headerLength
  const artifacts = header.artifacts.map((entry) => {
    if (!Number.isInteger(entry.size) || entry.size < 0 || offset + entry.size > payload.length) {
      throw new Error(`Invalid compiled artifact size for ${entry.name}.`)
    }
    const buffer = payload.subarray(offset, offset + entry.size)
    offset += entry.size
    const actualHash = createHash('sha256').update(buffer).digest('hex')
    if (actualHash !== entry.sha256) throw new Error(`Upload checksum mismatch for ${entry.name}.`)
    return { ...entry, buffer }
  })
  if (offset !== payload.length) throw new Error('Compiled asset envelope contains trailing bytes.')
  return artifacts
}

function assetPublisher() {
  let activePublish: Promise<unknown> | null = null

  const install = (middlewares: {
    use: (path: string, handler: (request: IncomingMessage, response: ServerResponse) => void) => void
  }) => {
    middlewares.use('/api/save-assets-local', async (request, response) => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store')
      if (request.method !== 'POST') {
        response.statusCode = 405
        response.end(JSON.stringify({ error: 'Method not allowed.' }))
        return
      }
      try {
        const artifacts = decodeAssetEnvelope(await readRequestBody(request))
        const { saveAssetsLocally } = await import('./scripts/save-assets-local.mjs')
        const result = await saveAssetsLocally({ assetRoot: LOCAL_ASSET_ROOT, artifacts })
        response.statusCode = 200
        response.end(JSON.stringify(result))
      } catch (error) {
        response.statusCode = 500
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
      }
    })

    middlewares.use('/api/publish-assets', async (request, response) => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store')
      if (request.method !== 'POST') {
        response.statusCode = 405
        response.end(JSON.stringify({ error: 'Method not allowed.' }))
        return
      }
      if (activePublish) {
        response.statusCode = 409
        response.end(JSON.stringify({ error: 'A CDN publish is already running.' }))
        return
      }

      try {
        const packageIdHeader = request.headers['x-emperia-package-id']
        const expectedPackageId = Array.isArray(packageIdHeader) ? packageIdHeader[0] : packageIdHeader
        if (!expectedPackageId || !/^[a-f\d]{64}$/.test(expectedPackageId)) {
          response.statusCode = 400
          response.end(JSON.stringify({ error: 'A valid compiled package ID is required.' }))
          return
        }
        activePublish = import('./scripts/publish-assets.mjs')
          .then(({ publishAssets }) => publishAssets({ expectedPackageId }))
        const result = await activePublish
        response.statusCode = 200
        response.end(JSON.stringify(result))
      } catch (error) {
        response.statusCode = 500
        response.end(JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }))
      } finally {
        activePublish = null
      }
    })
  }

  return {
    name: 'emperia-asset-publisher',
    configureServer(server: { middlewares: Parameters<typeof install>[0] }) {
      install(server.middlewares)
    },
    configurePreviewServer(server: { middlewares: Parameters<typeof install>[0] }) {
      install(server.middlewares)
    },
  }
}

export default defineConfig({
  plugins: [react(), assetPublisher()],
})
