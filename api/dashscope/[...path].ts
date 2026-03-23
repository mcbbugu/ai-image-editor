export const config = { runtime: 'edge' }

export default async function handler(req: Request) {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api\/dashscope/, '')
  const target = `https://dashscope.aliyuncs.com${path}${url.search}`

  const headers = new Headers()
  for (const [key, value] of req.headers.entries()) {
    if (key.toLowerCase() !== 'host') headers.set(key, value)
  }
  headers.set('host', 'dashscope.aliyuncs.com')

  const response = await fetch(target, {
    method: req.method,
    headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
  })

  const resHeaders = new Headers()
  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() !== 'transfer-encoding') resHeaders.set(key, value)
  }
  resHeaders.set('access-control-allow-origin', '*')

  return new Response(response.body, { status: response.status, headers: resHeaders })
}
