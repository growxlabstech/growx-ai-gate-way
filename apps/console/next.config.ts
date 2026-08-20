import type { NextConfig } from "next";
const securityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];
const identityServiceUrl = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:4000";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@growx/ui"],
  async rewrites() {
    return [
      { source: "/api/auth/:path*", destination: `${identityServiceUrl}/v1/auth/:path*` },
      ...(process.env.D2_FIXTURE_IDENTITY === "1" ? [{ source: "/d2-session", destination: `${identityServiceUrl}/v1/auth/d2-session` }] : []),
    ];
  },
  async headers() { return [{ source: "/:path*", headers: securityHeaders }]; },
};
export default nextConfig;
