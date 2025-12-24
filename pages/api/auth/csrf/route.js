//pages\api\auth\csrf\route.js
import { getCsrfToken } from "next-auth/react";

export async function GET() {
  const csrfToken = await getCsrfToken();
  return new Response(JSON.stringify({ csrfToken }), {
    headers: { "Content-Type": "application/json" },
  });
}
