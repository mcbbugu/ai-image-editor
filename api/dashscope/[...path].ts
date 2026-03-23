export default async function handler(req: any, res: any) {
  const segments = req.query.path
  const path = Array.isArray(segments) ? segments.join('/') : (segments || '')

  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(req.query as Record<string, string>)) {
    if (key !== 'path') searchParams.set(key, value)
  }
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : ''
  const target = `https://dashscope.aliyuncs.com/${path}${qs}`

  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(req.headers as Record<string, string>)) {
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
  res.setHeader('content-type', response.headers.get('content-type') || 'application/json')
  res.send(data)
}

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } }
}
