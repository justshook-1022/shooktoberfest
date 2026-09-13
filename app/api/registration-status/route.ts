import { NextResponse } from "next/server";
import { getRegistrationOpen } from "../../../lib/registration-status";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ open: await getRegistrationOpen() }, {
    headers: { "Cache-Control": "no-store" },
  });
}
