// app/api/auth/[...nextauth]/route.js - NextAuth v5 API route
import { handlers } from "@/auth";

// Export handlers directly - NextAuth v5 handles errors internally
export const { GET, POST } = handlers;

