export const config = { runtime: 'edge' }

export default async function handler(req: Request) {
  const url = new URL(req.url)
  const target = url.searchParams.get('url')
  if (!target) return new Response('missing url', { status: 400 })

  const response = await fetch(target)
  const headers = new Headers()
  headers.set('content-type', response.headers.get('content-type') || 'image/png')
  headers.set('access-control-allow-origin', '*')

  return new Response(response.body, { status: response.status, headers })
}
