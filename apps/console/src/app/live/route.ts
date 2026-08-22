export function GET() {
  return Response.json({
    status: "ok",
    service: "console",
    timestamp: new Date().toISOString(),
  });
}
