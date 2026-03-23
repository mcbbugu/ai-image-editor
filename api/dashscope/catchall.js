module.exports = async function handler(req, res) {
  const segments = req.query.path
  const path = Array.isArray(segments) ? segments.join('/') : (segments || '')
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'path') searchParams.set(key, value)
  }
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : ''
  const target = `https://dashscope.aliyuncs.com/${path}${qs}`

  const headers = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (!['host', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) {
      headers[key] = value
    }
  }

  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? JSON.stringify(req.body)
    : undefined

  const response = await fetch(target, { method: req.method, headers, body })
  const data = await response.text()

  res.status(response.status)
    .setHeader('content-type', response.headers.get('content-type') || 'application/json')
    .send(data)
}

module.exports.config = {
  api: { bodyParser: { sizeLimit: '10mb' } }
}
