import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'img-proxy',
      configureServer(server) {
        server.middlewares.use('/img-proxy', async (req, res) => {
          const target = new URL(req.url!, 'http://localhost').searchParams.get('url')
          if (!target) { res.statusCode = 400; res.end(); return }
          try {
            const response = await fetch(target)
            const buffer = await response.arrayBuffer()
            res.setHeader('Content-Type', response.headers.get('content-type') || 'image/png')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(Buffer.from(buffer))
          } catch {
            res.statusCode = 502; res.end()
          }
        })
      },
    },
  ],
  server: {
    proxy: {
      '/dashscope': {
        target: 'https://dashscope.aliyuncs.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/dashscope/, ''),
      },
    },
  },
})
