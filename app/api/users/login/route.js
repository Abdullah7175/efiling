// import { NextResponse } from "next/server";
// import bcrypt from "bcryptjs";
// import { connectToDatabase } from "@/lib/db"; // Ensure your DB connection is correctly configured
// import jwt from "jsonwebtoken";
// import { query } from "@/lib/db";


// // Login API endpoint
// export async function POST(req) {
//   const { email, password } = await req.json(); // Get login credentials from the request

//   try {
//     const client = await connectToDatabase();

//     // Query user by email
//     // const query = `SELECT * FROM users WHERE email = $1`;
//     // const result = await client.query(query, [email]);
//     const result = await query(`SELECT * FROM users WHERE email = $1`, [email]);

//     if (result.rows.length === 0) {
//       return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
//     }

//     const user = result.rows[0];

//     // Compare provided password with stored hash
//     const isPasswordValid = await bcrypt.compare(password, user.password);
//     if (!isPasswordValid) {
//       return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
//     }

//     // Generate JWT token
//     const payload = { userId: user.id, email: user.email }; // Data to store in the token
//     const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });

//     // Send the token back to the client
//     return NextResponse.json(
//       {
//         message: "Login successful",
//         token, // Send the token back to the client
//         user: {
//           id: user.id,
//           name: user.name,
//           email: user.email,
//         },
//       },
//       { status: 200 }
//     );
//   } catch (error) {
//     console.error("Error during login:", error);
//     return NextResponse.json({ error: "Error during login" }, { status: 500 });
//   }
// }
//app\api\users\login\route.js
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/db";
import jwt from "jsonwebtoken";
import { actionLogger, ACTION_TYPES } from "@/lib/actionLogger";
import { eFilingLoginLogger } from "@/lib/efilingLoginLogger";

export async function POST(req) {
  const { email, password } = await req.json();

  try {
    const client = await connectToDatabase();

    // Check in all user tables
    const userTypes = [
      { table: 'users', query: 'SELECT * FROM users WHERE email = $1' },
      { table: 'agents', query: 'SELECT * FROM agents WHERE email = $1' },
      { table: 'socialmediaperson', query: 'SELECT * FROM socialmediaperson WHERE email = $1' }
    ];

    let user = null;
    let userType = null;

    for (const { table, query } of userTypes) {
      const result = await client.query(query, [email]);
      if (result.rows.length > 0) {
        user = result.rows[0];
        userType = table;
        break;
      }
    }

    if (!user) {
      // Log failed login attempt
      await eFilingLoginLogger.authAttempt(req, null, false, { email });
      
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      // Log failed password attempt
      await eFilingLoginLogger.authAttempt(req, null, false, { email });
      
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Create JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        userType
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Log the login action - use e-filing logger for e-filing users
    if (userType === 'users') {
      // This is likely an e-filing user, log to efiling_user_actions
      await eFilingLoginLogger.login(req, {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        userType: userType
      }, {
        loginMethod: 'email_password',
        userType: userType
      });
    } else {
      // Log to general user_actions for other user types
      await actionLogger.login(req, {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        userType: userType
      }, {
        loginMethod: 'email_password',
        userType: userType
      });
    }

    return NextResponse.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        userType
      }
    });

  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}