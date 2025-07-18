import jwt from 'jsonwebtoken';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const onRequestOptions = () => new Response(null, { headers: corsHeaders });

async function getUserId(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    console.error('Auth header missing or invalid.');
    return null;
  }
  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    console.log('Token verified successfully for user ID:', decoded.id);
    return decoded.id;
  } catch (err) {
    console.error('JWT verification failed:', err.message);
    return null;
  }
}

// GET /lists - Fetch all lists for a user
export const onRequestGet = async ({ request, env }) => {
  const userId = await getUserId(request, env);
  if (!userId) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

  try {
    const { results } = await env.DB.prepare('SELECT id, name, songs, color FROM lists WHERE user_id = ?')
      .bind(userId)
      .all();
    
    const lists = results.map(list => ({
      ...list,
      songs: JSON.parse(list.songs || '[]'),
    }));

    return new Response(JSON.stringify(lists), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    return new Response('Server error', { status: 500, headers: corsHeaders });
  }
};

// POST /lists - Create a new list
export const onRequestPost = async ({ request, env }) => {
    const userId = await getUserId(request, env);
    if (!userId) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  
    try {
      const { name, color } = await request.json();
      if (!name) return new Response('Missing list name', { status: 400, headers: corsHeaders });
  
      const { results } = await env.DB.prepare('SELECT id FROM lists WHERE user_id = ? AND name = ?')
        .bind(userId, name)
        .all();
  
      if (results.length > 0) {
        return new Response('A list with this name already exists', { status: 409, headers: corsHeaders });
      }
  
      const { lastRowId } = await env.DB.prepare('INSERT INTO lists (user_id, name, songs, color) VALUES (?, ?, ?, ?)')
        .bind(userId, name, '[]', color || '#1E90FF')
        .run();
  
      const newList = { id: lastRowId, name, songs: [], color: color || '#1E90FF' };
      return new Response(JSON.stringify(newList), {
        status: 201,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (err) {
      return new Response('Server error', { status: 500, headers: corsHeaders });
    }
  };
