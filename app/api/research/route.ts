import { NextResponse } from "next/server";
import { researchCivicGraph } from "@/lib/civic-research";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    address?: string;
    query?: string;
    range?: 2 | 4;
  };

  const range = body.range === 2 ? 2 : 4;
  const address = body.address?.trim();

  if (!address) {
    return NextResponse.json({ error: "Address or city is required." }, { status: 400 });
  }

  const result = await researchCivicGraph(address, range, body.query);
  return NextResponse.json(result);
}
