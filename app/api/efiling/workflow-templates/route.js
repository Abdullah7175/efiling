import { NextResponse } from 'next/server';

const RETIRED = NextResponse.json({
    error: 'Workflow templates are no longer supported. Geographic routing is now active.'
}, { status: 410 });

export async function GET() {
    return RETIRED;
}

export async function POST() {
    return RETIRED;
}

export async function PUT() {
    return RETIRED;
}

export async function DELETE() {
    return RETIRED;
}

