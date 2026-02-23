/**
 * Mock scan API. Returns a placeholder image (1x1 PNG). In production, this would
 * talk to a local scanner helper or device.
 */

import { NextResponse } from "next/server";

// Minimal 1x1 transparent PNG
const MOCK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export async function POST() {
  const buffer = Buffer.from(MOCK_PNG_BASE64, "base64");
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": "inline",
    },
  });
}
