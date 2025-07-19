export default {
  async fetch(request, env) {
    if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
      return new Response('ASSETS binding missing', { status: 500 });
    }

    const url = new URL(request.url);

    // For requests that look like SPA routes (no file extension), always serve
    // the main index file so the front-end router can resolve the path.
    if (request.method === 'GET' && !url.pathname.includes('.')) {
      return env.ASSETS.fetch(new Request('/index.html', request));
    }

    // Otherwise treat as a normal static asset request.
    return env.ASSETS.fetch(request);
  },
};
