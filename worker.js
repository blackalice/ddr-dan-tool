import { getAssetFromKV } from '@cloudflare/kv-asset-handler';

export default {
  async fetch(request, env) {
    try {
      const options = {
        ASSET_NAMESPACE: env.__STATIC_CONTENT,
        ASSET_MANIFEST: JSON.parse(env.__STATIC_CONTENT_MANIFEST || '{}'),
      };
      return getAssetFromKV({ request }, options);
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  },
};
