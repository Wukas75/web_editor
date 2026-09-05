// Servuje médiá nahraté v editore z R2 (binding R2). Cesta: /img/<kľúč>
export async function onRequest(context) {
  const { env, params, request } = context
  const key = Array.isArray(params.key) ? params.key.join('/') : params.key
  if (!key) return new Response('Not found', { status: 404 })

  const obj = await env.R2.get(key)
  if (!obj || !obj.body) return new Response('Not found', { status: 404 })

  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')

  if (request.headers.get('if-none-match') === obj.httpEtag) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(obj.body, { headers })
}
