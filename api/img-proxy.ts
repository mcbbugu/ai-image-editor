export default async function handler(req: any, res: any) {
  const target = req.query.url
  if (!target) { res.status(400).send('missing url'); return }

  const response = await fetch(target)
  const buffer = await response.arrayBuffer()

  res.setHeader('content-type', response.headers.get('content-type') || 'image/png')
  res.setHeader('access-control-allow-origin', '*')
  res.status(response.status).send(Buffer.from(buffer))
}
