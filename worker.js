export default {
  async fetch(request, env) {
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }
    return new Response('ASSETS binding missing', { status: 500 });
  },
};
