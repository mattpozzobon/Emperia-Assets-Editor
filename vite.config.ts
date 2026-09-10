import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function assetPublisher() {
  let activePublish: Promise<unknown> | null = null

  const install = (middlewares: {
    use: (path: string, handler: (request: {
      method?: string
      headers: Record<string, string | string[] | undefined>
    }, response: {
      statusCode: number
      setHeader: (name: string, value: string) => void
      end: (body: string) => void
    }) => void) => void
  }) => {
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
