const https = require('https')

module.exports = function handler(req, res) {
  const segments = req.query.path
  const path = Array.isArray(segments) ? segments.join('/') : (segments || '')

  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'path') searchParams.set(key, String(value))
  }
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : ''

  const headers = {}
  for (const [key, value] of Object.entries(req.headers)) {
    const k = key.toLowerCase()
    if (!['host', 'connection'].includes(k)) headers[key] = value
  }
  headers['host'] = 'dashscope.aliyuncs.com'

  const options = {
    hostname: 'dashscope.aliyuncs.com',
    path: `/${path}${qs}`,
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

module.exports.config = {
  api: { bodyParser: false }
}
