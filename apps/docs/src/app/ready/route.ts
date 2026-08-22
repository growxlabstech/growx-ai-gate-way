export function GET() {
  return Response.json({
    status: "ok",
    service: "docs",
    timestamp: new Date().toISOString(),
  });
}
