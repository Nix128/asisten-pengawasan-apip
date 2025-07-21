const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Daftar admin (dalam produksi, simpan di database)
const ADMIN_CREDENTIALS = [
  { username: 'admin', password: process.env.ADMIN_PASSWORD }
];

exports.handler = async (event) => {
  const { username, password } = JSON.parse(event.body);

  const admin = ADMIN_CREDENTIALS.find(a => 
    a.username === username && a.password === password
  );

  if (admin) {
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Login berhasil',
        token: Buffer.from(`${username}:${password}`).toString('base64')
      })
    };
  }

  return {
    statusCode: 401,
    body: JSON.stringify({ error: 'Kredensial tidak valid' })
  };
};