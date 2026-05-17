import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://novaforge-api-lf6u.onrender.com";
  
  try {
    const res = await fetch(`${apiUrl}/api/health`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json({ pinged: true, backend: data, timestamp: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ pinged: false, error: (error as Error).message, timestamp: new Date().toISOString() }, { status: 502 });
  }
}
