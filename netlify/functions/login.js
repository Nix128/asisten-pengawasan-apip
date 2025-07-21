const bcrypt = require('bcryptjs');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { username, password } = JSON.parse(event.body);
  const validUsername = process.env.ADMIN_USERNAME || 'admin';
  const validPasswordHash = process.env.ADMIN_PASSWORD_HASH;

  if (!validPasswordHash) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  try {
    const isPasswordValid = await bcrypt.compare(password, validPasswordHash);

    if (username === validUsername && isPasswordValid) {
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          user: { 
            id: 'admin',
            username,
            role: 'admin'
          }
        })
      };
    } else {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' })
      };
    }
  } catch (error) {
    console.error('Login error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};