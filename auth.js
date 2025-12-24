// auth.js - NextAuth v5 (Auth.js) configuration
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { connectToDatabase } from '@/lib/db';
import { eFileActionLogger } from '@/lib/efilingActionLogger';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true, // Allow localhost and other hosts in development
  basePath: "/api/auth", // Explicitly set the base path
  // Use NEXTAUTH_URL from environment or default to localhost
  // For production with SSL, ensure this is set to https://wmp.kwsc.gos.pk
  url: process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://119.30.113.18:5000",
  // Explicitly trust the host for CSRF token validation
  useSecureCookies: process.env.NODE_ENV === 'production' || process.env.NEXTAUTH_URL?.startsWith('https://'),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        let client;
        try {
          console.log('Starting authentication for:', credentials.email);
          
          if (!credentials.email || !credentials.password) {
            console.log('Missing email or password');
            return null;
          }
          
          client = await connectToDatabase();
          console.log('Database connected successfully');
          
          // Check users table first
          console.log('Checking users table...');
          let userResult = await client.query('SELECT * FROM users WHERE email = $1', [credentials.email]);
          
          if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            console.log('User found in users table, mapped userType: user');
            
            // Diagnostic logging for password verification
            const storedPassword = user.password ? user.password.trim() : null;
            
            // Check if password field exists and is not null
            if (!storedPassword) {
              console.log('User has no password set');
              await client.release();
              return null;
            }
            const passwordLength = storedPassword ? storedPassword.length : 0;
            const isBcryptHash = storedPassword && (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$'));
            console.log('Password diagnostic:', {
              hasPassword: !!storedPassword,
              passwordLength,
              isBcryptHash,
              hashPrefix: storedPassword ? storedPassword.substring(0, 7) : 'none',
              inputPasswordLength: credentials.password ? credentials.password.length : 0
            });
            
            console.log('Verifying password...');
            let isValid = false;
            try {
              isValid = await bcrypt.compare(credentials.password, storedPassword);
              console.log('Password verification result:', isValid);
              
              // If verification fails, try with trimmed input password (in case of whitespace)
              if (!isValid && credentials.password.trim() !== credentials.password) {
                console.log('Retrying with trimmed input password...');
                isValid = await bcrypt.compare(credentials.password.trim(), storedPassword);
                console.log('Password verification result (trimmed):', isValid);
              }
            } catch (compareError) {
              console.error('Error during password comparison:', compareError.message);
              console.error('Hash format check:', {
                startsWith2a: storedPassword.startsWith('$2a$'),
                startsWith2b: storedPassword.startsWith('$2b$'),
                startsWith2y: storedPassword.startsWith('$2y$'),
                hashLength: storedPassword.length
              });
            }
            
            if (isValid) {
              console.log('Password verified successfully');
              console.log('User authenticated:', { id: user.id, name: user.name, userType: 'user', role: user.role });
              await client.release();
              return {
                id: user.id.toString(),
                name: user.name,
                email: user.email,
                role: user.role,
                userType: 'user'
              };
            } else {
              console.log('Password verification failed for user');
            }
          }
          
          // Check agents table
          let agentResult = await client.query('SELECT * FROM agents WHERE email = $1', [credentials.email]);
          
          if (agentResult.rows.length > 0) {
            const agent = agentResult.rows[0];
            console.log('User found in agents table, mapped userType: agent');
            
            // Diagnostic logging for password verification
            const storedPassword = agent.password ? agent.password.trim() : null;
            
            if (!storedPassword) {
              console.log('Agent has no password set');
              await client.release();
              return null;
            }
            const passwordLength = storedPassword ? storedPassword.length : 0;
            const isBcryptHash = storedPassword && (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$'));
            console.log('Password diagnostic (agent):', {
              hasPassword: !!storedPassword,
              passwordLength,
              isBcryptHash,
              hashPrefix: storedPassword ? storedPassword.substring(0, 7) : 'none',
              inputPasswordLength: credentials.password ? credentials.password.length : 0
            });
            
            console.log('Verifying password...');
            const isValid = await bcrypt.compare(credentials.password, storedPassword);
            console.log('Password verification result:', isValid);
            
            if (isValid) {
              console.log('Password verified successfully');
              console.log('User authenticated:', { id: agent.id, name: agent.name, userType: 'agent', role: agent.role });
              await client.release();
              return {
                id: agent.id.toString(),
                name: agent.name,
                email: agent.email,
                role: agent.role,
                userType: 'agent'
              };
            } else {
              console.log('Password verification failed for agent');
            }
          }
          
          // Check socialmediaperson table
          let smResult = await client.query('SELECT * FROM socialmediaperson WHERE email = $1', [credentials.email]);
          
          if (smResult.rows.length > 0) {
            const sm = smResult.rows[0];
            console.log('User found in socialmediaperson table, mapped userType: socialmedia');
            
            // Diagnostic logging for password verification
            const storedPassword = sm.password ? sm.password.trim() : null;
            
            if (!storedPassword) {
              console.log('Social media person has no password set');
              await client.release();
              return null;
            }
            const passwordLength = storedPassword ? storedPassword.length : 0;
            const isBcryptHash = storedPassword && (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$'));
            console.log('Password diagnostic (socialmedia):', {
              hasPassword: !!storedPassword,
              passwordLength,
              isBcryptHash,
              hashPrefix: storedPassword ? storedPassword.substring(0, 7) : 'none',
              inputPasswordLength: credentials.password ? credentials.password.length : 0
            });
            
            console.log('Verifying password...');
            const isValid = await bcrypt.compare(credentials.password, storedPassword);
            console.log('Password verification result:', isValid);
            
            if (isValid) {
              console.log('Password verified successfully');
              console.log('User authenticated:', { id: sm.id, name: sm.name, userType: 'socialmedia', role: sm.role });
              await client.release();
              return {
                id: sm.id.toString(),
                name: sm.name,
                email: sm.email,
                role: sm.role,
                userType: 'socialmedia'
              };
            } else {
              console.log('Password verification failed for social media person');
            }
          }
          
          console.log('No matching user found or password incorrect');
          await client.release();
          return null;
        } catch (error) {
          console.error('Authentication error:', error);
          if (client) {
            await client.release();
          }
          return null;
        }
      }
    })
  ],
  pages: {
    signIn: "/",
    error: "/"
  },
  // SECURITY: No default secret - must be set in environment variables
  secret: (() => {
    if (!process.env.NEXTAUTH_SECRET) {
      throw new Error('NEXTAUTH_SECRET must be set in environment variables');
    }
    return process.env.NEXTAUTH_SECRET;
  })(),
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 // 1 hour
  },
  cookies: {
    sessionToken: {
      name: `${process.env.NODE_ENV === 'production' ? '__Secure-' : ''}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production' || process.env.NEXTAUTH_URL?.startsWith('https://'),
      },
    },
    callbackUrl: {
      name: `${process.env.NODE_ENV === 'production' ? '__Secure-' : ''}next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production' || process.env.NEXTAUTH_URL?.startsWith('https://'),
      },
    },
    csrfToken: {
      // Use __Secure- instead of __Host- if behind a reverse proxy
      // __Host- requires exact host match and no domain, which can fail behind proxies
      name: `${process.env.NODE_ENV === 'production' && !process.env.BEHIND_PROXY ? '__Host-' : process.env.NODE_ENV === 'production' ? '__Secure-' : ''}next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production' || process.env.NEXTAUTH_URL?.startsWith('https://'),
        // __Host- prefix requires no domain attribute
        // If behind proxy, you might need to set domain explicitly
        ...(process.env.NODE_ENV === 'production' && process.env.BEHIND_PROXY && process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
      },
    },
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.user = user;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.user) {
        session.user = token.user;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      // Log successful login
      try {
        if (user && user.id) {
          await eFileActionLogger.logAction({
            entityId: null,
            userId: user.id.toString(),
            action: 'USER_LOGIN',
            entityType: 'auth',
            details: { 
              method: account?.provider || 'credentials', 
              userType: user.userType || 'user',
              description: `User "${user.name}" logged into e-filing system`
            }
          });
        }
      } catch (logError) {
        console.error('Error logging login action:', logError);
        // Don't fail the login if logging fails
      }
      
      if (account?.provider === 'google') {
        try {
          const client = await connectToDatabase();
          
          // Check if user exists in any of our tables
          let userResult = await client.query('SELECT * FROM users WHERE email = $1', [user.email]);
          let agentResult = await client.query('SELECT * FROM agents WHERE email = $1', [user.email]);
          let smResult = await client.query('SELECT * FROM socialmediaperson WHERE email = $1', [user.email]);
          
          if (userResult.rows.length > 0) {
            const dbUser = userResult.rows[0];
            user.id = dbUser.id.toString();
            user.role = dbUser.role;
            user.userType = 'user';
          } else if (agentResult.rows.length > 0) {
            const dbUser = agentResult.rows[0];
            user.id = dbUser.id.toString();
            user.role = dbUser.role;
            user.userType = 'agent';
          } else if (smResult.rows.length > 0) {
            const dbUser = smResult.rows[0];
            user.id = dbUser.id.toString();
            user.role = dbUser.role;
            user.userType = 'socialmedia';
          } else {
            // Create new user in users table if not found
            const newUserResult = await client.query(
              'INSERT INTO users (name, email, role, userType) VALUES ($1, $2, $3, $4) RETURNING *',
              [user.name, user.email, 'user', 'user']
            );
            user.id = newUserResult.rows[0].id.toString();
            user.role = 'user';
            user.userType = 'user';
          }
          
          await client.release();
          return true;
        } catch (error) {
          console.error('Error during Google sign in:', error);
          return false;
        }
      }
      return true;
    }
  },
  events: {
    async signOut({ session, token }) {
      // Log successful logout
      try {
        const user = session?.user || token?.user;
        if (user?.id) {
          await eFileActionLogger.logAction({
            entityId: null,
            userId: user.id.toString(),
            action: 'USER_LOGOUT',
            entityType: 'auth',
            details: { 
              method: 'session_end', 
              userType: user.userType || 'user',
              description: `User "${user.name}" logged out from e-filing system`
            }
          });
        }
      } catch (logError) {
        console.error('Error logging logout action:', logError);
        // Don't fail the logout if logging fails
      }
    }
  }
});

