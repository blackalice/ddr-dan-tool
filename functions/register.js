import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
};

export const onRequestOptions = () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestPost = async ({ request, env }) => {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return new Response('Missing fields', { status: 400, headers: corsHeaders });
    }
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first();
    if (existing) {
      return new Response('User exists', { status: 409, headers: corsHeaders });
    }
    const hashed = await bcrypt.hash(password, 10);
    const result = await env.DB.prepare(
      'INSERT INTO users (email, hashed_password) VALUES (?, ?)'
    ).bind(email, hashed).run();
    const userId = result.lastRowId;
    const token = jwt.sign({ id: userId, email }, env.JWT_SECRET, { expiresIn: '7d' });
    return new Response(JSON.stringify({ token }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/`,
        ...corsHeaders
      }
    });
  } catch {
    return new Response('Server error', { status: 500, headers: corsHeaders });
  }
};
