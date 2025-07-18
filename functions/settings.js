import jwt from 'jsonwebtoken';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
};

export const onRequestOptions = () => new Response(null, { headers: corsHeaders });

function getToken(request) {
  const auth = request.headers.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/token=([^;]+)/);
  return match ? match[1] : null;
}

async function getUserId(request, env) {
  const token = getToken(request);
  if (!token) return null;
  try {
    const data = jwt.verify(token, env.JWT_SECRET);
    return data.id;
  } catch {
    return null;
  }
}

export const onRequestGet = async ({ request, env }) => {
  const userId = await getUserId(request, env);
  if (!userId) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  const row = await env.DB.prepare('SELECT settings FROM users WHERE id = ?').bind(userId).first();
  return new Response(row?.settings || '{}', {
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
};

export const onRequestPut = async ({ request, env }) => {
  const userId = await getUserId(request, env);
  if (!userId) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  const settings = await request.text();
  await env.DB.prepare('UPDATE users SET settings = ? WHERE id = ?').bind(settings, userId).run();
  return new Response('OK', { headers: corsHeaders });
};
