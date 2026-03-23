import https from 'https'

export default function handler(req, res) {
  const target = req.query.target
  if (!target) { res.status(400).json({ error: 'missing target' }); return }

  const headers = {}
  for (const [key, value] of Object.entries(req.headers)) {
    const k = key.toLowerCase()
    if (!['host', 'connection'].includes(k)) headers[key] = value
  }
  headers['host'] = 'dashscope.aliyuncs.com'

  const options = {
    hostname: 'dashscope.aliyuncs.com',
    path: '/' + target,
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
  api: { bodyParser: false }
}
