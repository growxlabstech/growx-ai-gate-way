import Link from "next/link";

export function FirstRunBanner({
  organizationSlug,
  workspaceSlug,
}: {
  organizationSlug: string;
  workspaceSlug: string;
}) {
  const base = `/${organizationSlug}/${workspaceSlug}`;

  return (
    <section className="first-run-card" aria-label="Get Started Guide">
      <div className="first-run-content">
        <div className="first-run-badge">Workspace Ready</div>
        <h2>Connect your application to GrowX Gateway</h2>
        <p>
          Send high-throughput AI requests with unified OpenAI, Anthropic, and
          custom router routing, exact caching, and automatic multi-provider
          fallback.
        </p>

        <div className="first-run-actions">
          <Link href={`${base}/api-keys`} className="btn-primary">
            Create an API Key
          </Link>
          <Link href={`${base}/playground`} className="btn-secondary">
            Test in Playground
          </Link>
        </div>
      </div>

      <div className="first-run-code-preview">
        <div className="code-header">
          <span>Quickstart Request</span>
          <code>cURL</code>
        </div>
        <pre className="code-block font-mono">
          {`curl https://api.growx.ai/v1/chat/completions \\
  -H "Authorization: Bearer gx_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "growx/fast",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}
        </pre>
      </div>
    </section>
  );
}
