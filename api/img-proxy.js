module.exports = async function handler(req, res) {
  const target = req.query.url
  if (!target) { res.status(400).send('missing url'); return }

  const response = await fetch(target)
  const buffer = await response.arrayBuffer()

  res.setHeader('content-type', response.headers.get('content-type') || 'image/png')
    .setHeader('access-control-allow-origin', '*')
    .status(response.status)
    .send(Buffer.from(buffer))
}
