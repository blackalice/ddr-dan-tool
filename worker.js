export default {
  async fetch(request, env) {
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      let response = await env.ASSETS.fetch(request);

      // If the asset was not found and the path doesn't look like a file,
      // fall back to serving the SPA entry point so client-side routing works.
      if (
        response.status === 404 &&
        !new URL(request.url).pathname.includes('.')
      ) {
        const indexRequest = new Request(new URL('/index.html', request.url), request);
        response = await env.ASSETS.fetch(indexRequest);
      }

      return response;
    }

    return new Response('ASSETS binding missing', { status: 500 });
  },
};
