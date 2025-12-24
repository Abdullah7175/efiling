// app/api/users/me/route.js
import { NextResponse } from "next/server";
import { verify } from "jsonwebtoken";
import { connectToDatabase } from '@/lib/db';

export async function GET(req) {
  try {
    const token = req.cookies.get('jwtToken')?.value;

    if (!token) {
      return NextResponse.json({ error: "No token provided" }, { status: 401 });
    }

    const decoded = verify(token, process.env.JWT_SECRET);
    
    let query, table;
    switch(decoded.userType) {
      case 'agents':
        query = 'SELECT * FROM agents WHERE email = $1';
        table = 'agents';
        break;
      case 'socialmediaperson':
        query = 'SELECT * FROM socialmediaperson WHERE email = $1';
        table = 'socialmediaperson';
        break;
      default:
        query = 'SELECT * FROM users WHERE email = $1';
        table = 'users';
    }

    const client = await connectToDatabase();
    const result = await client.query(query, [decoded.email]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = result.rows[0];
    
    // Debug logging
    console.log('Debug - User from DB:', {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      userType: decoded.userType
    });
    
    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image || '/avatar.png',
      role: user.role,
      userType: decoded.userType
    });

  } catch (error) {
    console.error("Error verifying token:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
