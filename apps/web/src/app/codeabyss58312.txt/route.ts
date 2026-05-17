import { NextResponse } from "next/server";

export async function GET() {
  return new NextResponse("codeabyss58312", {
    headers: { "Content-Type": "text/plain" },
  });
}
