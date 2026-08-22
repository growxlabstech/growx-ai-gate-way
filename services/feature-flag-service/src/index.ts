import { createServer } from "node:http";

export const serviceName = "feature-flag-service";
export function createApp() {
  return createServer((request, response) => {
    const status = {
      status: "ok",
      service: serviceName,
      timestamp: new Date().toISOString(),
    };
    if (
      request.url === "/health" ||
      request.url === "/live" ||
      request.url === "/ready"
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(status));
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: { code: "NOT_FOUND", message: "Route not found" },
      }),
    );
  });
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 4000);
  createApp().listen(port);
}
