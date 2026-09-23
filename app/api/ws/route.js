import { NextResponse } from "next/server";

export async function GET(req) {
  // If an HTTP GET request hits this endpoint (without WebSocket Upgrade), return protocol info
  return NextResponse.json({
    status: "BMS Realtime WebSocket Gateway",
    protocol: "BRP v1",
    transport: "WebSocket",
    endpoint: "/api/ws",
    timestamp: new Date().toISOString()
  });
}
