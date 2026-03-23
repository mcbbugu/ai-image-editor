const https = require('https')

module.exports = async function handler(req, res) {
  try {
    const segments = req.query.path
    const path = Array.isArray(segments) ? segments.join('/') : (segments || '')
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== 'path') searchParams.set(key, String(value))
    }
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : ''
    const target = `https://dashscope.aliyuncs.com/${path}${qs}`

    const headers = {}
    for (const [key, value] of Object.entries(req.headers)) {
      const k = key.toLowerCase()
      if (!['host', 'connection', 'transfer-encoding', 'content-length'].includes(k)) {
        headers[key] = value
      }
    }

    const bodyStr = req.method !== 'GET' && req.method !== 'HEAD'
      ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
      : undefined

    if (bodyStr) headers['content-length'] = Buffer.byteLength(bodyStr).toString()

    const data = await new Promise((resolve, reject) => {
      const url = new URL(target)
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: req.method,
        headers,
      }
      const request = https.request(options, (response) => {
        let chunks = []
        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }))
      })
      request.on('error', reject)
      if (bodyStr) request.write(bodyStr)
      request.end()
    })

    res.status(data.status)
    const ct = data.headers['content-type']
    if (ct) res.setHeader('content-type', ct)
    res.send(data.body)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports.config = {
  api: { bodyParser: { sizeLimit: '10mb' } }
}
