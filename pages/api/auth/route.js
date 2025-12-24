//pages\api\auth\route.js
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '@/lib/db';
require('dotenv').config();

export async function POST(req) {
  let client;
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
    }

    console.log('Starting authentication for:', username);
    client = await connectToDatabase();
    console.log('Database connected successfully for auth');

    const query = 'SELECT * FROM users WHERE email = $1';
    const { rows: user } = await client.query(query, [username]);

    if (user.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const isValid = await bcrypt.compare(password, user[0].password);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const { password: _, ...userWithoutPassword } = user[0];
    console.log('Authentication successful for:', username);

    return NextResponse.json({ user: userWithoutPassword }, { status: 200 });

  } catch (error) {
    console.error('Authentication error:', {
      error: error.message,
      code: error.code,
      username: req.body?.username || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    // Check if it's a database connection error
    if (error.message.includes('timeout') || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return NextResponse.json({ 
        error: 'Database connection failed. Please try again later.' 
      }, { status: 503 });
    }
    
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  } finally {
    if (client && client.release) {
      client.release();
    }
  }
}
