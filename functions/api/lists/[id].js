import jwt from 'jsonwebtoken';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const onRequestOptions = () => new Response(null, { headers: corsHeaders });

async function getUserId(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    const { id } = jwt.verify(token, env.JWT_SECRET);
    return id;
  } catch (err) {
    return null;
  }
}

// PUT /lists/:id - Update a list
export const onRequestPut = async ({ request, env, params }) => {
  const userId = await getUserId(request, env);
  if (!userId) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

  const listId = params.id;
  if (!listId) return new Response('Missing list ID', { status: 400, headers: corsHeaders });

  try {
    const { name, songs, color } = await request.json();
    const updates = [];
    const bindings = [];

    if (name) {
      updates.push('name = ?');
      bindings.push(name);
    }
    if (songs) {
      updates.push('songs = ?');
      bindings.push(JSON.stringify(songs));
    }
    if (color) {
      updates.push('color = ?');
      bindings.push(color);
    }

    if (updates.length === 0) {
      return new Response('No fields to update', { status: 400, headers: corsHeaders });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    bindings.push(listId, userId);

    const { changes } = await env.DB.prepare(`UPDATE lists SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
      .bind(...bindings)
      .run();

    if (changes === 0) {
      return new Response('List not found or not owned by user', { status: 404, headers: corsHeaders });
    }

    return new Response('OK', { headers: corsHeaders });
  } catch (err) {
    return new Response('Server error', { status: 500, headers: corsHeaders });
  }
};

// DELETE /lists/:id - Delete a list
export const onRequestDelete = async ({ request, env, params }) => {
  const userId = await getUserId(request, env);
  if (!userId) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

  const listId = params.id;
  if (!listId) return new Response('Missing list ID', { status: 400, headers: corsHeaders });

  try {
    const { changes } = await env.DB.prepare('DELETE FROM lists WHERE id = ? AND user_id = ?')
      .bind(listId, userId)
      .run();

    if (changes === 0) {
      return new Response('List not found or not owned by user', { status: 404, headers: corsHeaders });
    }

    return new Response('OK', { headers: corsHeaders });
  } catch (err) {
    return new Response('Server error', { status: 500, headers: corsHeaders });
  }
};
