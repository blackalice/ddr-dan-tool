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
    const row = await env.DB.prepare('SELECT id, hashed_password FROM users WHERE email = ?')
      .bind(email)
      .first();
    if (!row) {
      return new Response('Invalid credentials', { status: 401, headers: corsHeaders });
    }
    const match = await bcrypt.compare(password, row.hashed_password);
    if (!match) {
      return new Response('Invalid credentials', { status: 401, headers: corsHeaders });
    }
    const token = jwt.sign({ id: row.id, email }, env.JWT_SECRET, { expiresIn: '7d' });
    return new Response(JSON.stringify({ token }), {
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
