export function GET() {
  return Response.json({
    status: "ok",
    service: "admin",
    timestamp: new Date().toISOString(),
  });
}
