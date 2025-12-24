import { NextResponse } from 'next/server';

const RETIRED = NextResponse.json({
    error: 'Legacy workflow APIs have been retired. Geographic routing is now active.'
}, { status: 410 });

export async function GET() {
    return RETIRED;
}

export async function POST() {
    return RETIRED;
}
