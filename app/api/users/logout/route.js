import { NextResponse } from "next/server";

// This route handles user logout
export async function GET() {
  try {
    const response = NextResponse.json(
      { message: "Logged out successfully" },
      { status: 200 }
    );

    // Clear the JWT token cookie by setting it to empty and expired
    response.cookies.set("jwtToken", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(0), // Expire immediately
    });

    return response;
  } catch (error) {
    console.error("Error during logout:", error);
    return NextResponse.json({ error: "Error during logout" }, { status: 500 });
  }
}
