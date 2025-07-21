// login.js - Multi-User Authentication with Netlify Secrets
exports.handler = async (event) => {
  // 1. Handle CORS (untuk frontend)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ message: 'CORS preflight passed' })
    };
  }

  // 2. Hanya terima POST request
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    // 3. Parse request body
    const { username, password } = JSON.parse(event.body);

    // 4. Definisikan user database dari Netlify Secrets
    const users = {
      // Admin (full access)
      [process.env.ADMIN_USERNAME]: {
        password: process.env.ADMIN_PASSWORD,
        role: 'admin',
        permissions: {
          access_knowledge_base: true,
          edit_content: true,
          manage_users: true
        }
      },
      // Regular user (read-only)
      [process.env.REGULAR_USERNAME]: {
        password: process.env.REGULAR_PASSWORD,
        role: 'regular',
        permissions: {
          access_knowledge_base: false,
          edit_content: false,
          manage_users: false
        }
      },
      // Guest user (opsional)
      [process.env.GUEST_USERNAME]: {
        password: process.env.GUEST_PASSWORD,
        role: 'guest',
        permissions: {
          access_knowledge_base: false,
          edit_content: false,
          manage_users: false
        }
      }
    };

    // 5. Autentikasi
    const user = users[username];

    if (!user) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'User tidak ditemukan' })
      };
    }

    // 6. Bandingkan password (plain text - hanya untuk development)
    if (password !== user.password) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Password salah' })
      };
    }

    // 7. Response sukses
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' 
      },
      body: JSON.stringify({
        user: {
          id: username.toLowerCase().replace(/\s+/g, '-'),
          username,
          role: user.role,
          permissions: user.permissions
        }
      })
    };

  } catch (error) {
    // 8. Handle error
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Internal Server Error',
        details: error.message 
      })
    };
  }
};