import https from 'https'

export default function handler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost')
  const prefix = '/api/dashscope'
  let pathAfter = url.pathname.slice(prefix.length)
  if (!pathAfter || pathAfter === '') pathAfter = '/'
  else if (!pathAfter.startsWith('/')) pathAfter = '/' + pathAfter
  const upstreamPath = pathAfter + url.search

  const headers = {}
  for (const [key, value] of Object.entries(req.headers)) {
    const k = key.toLowerCase()
    if (!['host', 'connection'].includes(k)) headers[key] = value
  }
  headers.host = 'dashscope.aliyuncs.com'

  const options = {
    hostname: 'dashscope.aliyuncs.com',
    path: upstreamPath,
    method: req.method,
    headers,
  }

  const proxy = https.request(options, (upstream) => {
    res.status(upstream.statusCode)
    for (const [key, value] of Object.entries(upstream.headers)) {
      if (key.toLowerCase() !== 'transfer-encoding') res.setHeader(key, value)
    }
    upstream.pipe(res)
  })

  proxy.on('error', (err) => res.status(502).json({ error: err.message }))
  req.pipe(proxy)
}

export const config = {
  api: { bodyParser: false },
}
