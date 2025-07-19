export default {
  async fetch(request, env) {
    if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
      return new Response('ASSETS binding missing', { status: 500 });
    }

    const url = new URL(request.url);

    // Attempt to fetch the requested asset first. If it exists, return it
    // immediately. This allows regular files like JSON and images to resolve
    // normally without falling back to the SPA index file.
    let response = await env.ASSETS.fetch(request);
    if (response.status !== 404) {
      return response;
    }

    // If the asset was not found and the request looks like an SPA route
    // (no file extension), serve the main index file so the client-side router
    // can handle the navigation.
    if (request.method === 'GET' && !url.pathname.includes('.')) {
      const indexUrl = new URL('/index.html', url);
      response = await env.ASSETS.fetch(new Request(indexUrl.toString(), request));
      if (response.status !== 404) {
        return response;
      }
    }

    // If everything fails, return the original response (likely a 404).
    return response;
  },
};
