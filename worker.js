export default {
  async fetch(request, env) {
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      const url = new URL(request.url);
      let response = await env.ASSETS.fetch(request);

      // Serve the SPA entry file for non-asset paths so the front-end router can
      // handle the URL. Preserve the query string to avoid losing application
      // state on refresh.
      if (response.status === 404 && !url.pathname.includes('.')) {
        const indexURL = new URL('/index.html', url.origin);
        indexURL.search = url.search; // keep query params
        const indexRequest = new Request(indexURL.toString(), request);
        response = await env.ASSETS.fetch(indexRequest);
      }

      return response;
    }

    return new Response('ASSETS binding missing', { status: 500 });
  },
};