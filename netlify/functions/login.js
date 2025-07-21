exports.handler = async (event) => {
  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { username, password } = JSON.parse(event.body);

    // 1. Ambil konfigurasi user dari Netlify Secrets
    const users = {
      admin: {
        password: process.env.ADMIN_PASSWORD, // Password langsung dari env
        role: 'admin',
        permissions: {
          access_knowledge_base: true,
          edit_content: true,
          manage_users: true
        }
      },
      user: {
        password: process.env.USER_PASSWORD, // Password langsung dari env
        role: 'regular',
        permissions: {
          access_knowledge_base: true,
          edit_content: false,
          manage_users: false
        }
      }
    };

    // 2. Validasi user
    const userConfig = users[username];
    if (!userConfig) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'User tidak ditemukan' })
      };
    }

    // 3. Verifikasi password (langsung bandingkan)
    if (password !== userConfig.password) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Password salah' })
      };
    }

    // 4. Response sukses
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: {
          username,
          role: userConfig.role,
          permissions: userConfig.permissions
        }
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};