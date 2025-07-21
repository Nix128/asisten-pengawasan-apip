// login.js - Versi Netlify Secrets
const { createClient } = require('@supabase/supabase-js')

exports.handler = async (event, context) => {
  // 1. Load secrets dari Netlify
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY

  // 2. Inisialisasi Supabase
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 3. Handle metode request
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    // 4. Parse data input
    const { email, password } = JSON.parse(event.body)

    // 5. Login dengan Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      return {
        statusCode: 401,
        body: JSON.stringify({ 
          error: 'Login gagal',
          details: error.message 
        })
      }
    }

    // 6. Response sukses
    return {
      statusCode: 200,
      body: JSON.stringify({
        user: data.user,
        session: data.session
      })
    }

  } catch (err) {
    // 7. Handle error tak terduga
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Server error',
        details: err.message 
      })
    }
  }
}