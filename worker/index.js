export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Strip the /physbox prefix to get the R2 key
    let key = url.pathname.replace(/^\/physbox\/?/, '');

    if (key === '' || key === '/') {
      key = 'index.html';
    }

    const object = await env.BUCKET.get(key);
    if (!object) {
      return new Response('Not Found', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    // Required for SharedArrayBuffer (WASM multithreading)
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');

    // Cache policy: HTML revalidates, hashed assets cache long-term
    if (key.endsWith('.html')) {
      headers.set('Cache-Control', 'no-cache');
    } else if (key.startsWith('assets/')) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    }

    return new Response(object.body, { headers });
  },
};
