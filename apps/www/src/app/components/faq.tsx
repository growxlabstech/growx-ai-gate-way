export function FAQ() {
  const items = [
    {
      q: "What is GrowX AI Gateway?",
      a: "GrowX AI Gateway is an infrastructure layer that provides a single API for accessing, routing, controlling, observing and governing multiple AI models from different providers. It handles authentication, model routing, fallback, usage accounting, and policy enforcement.",
    },
    {
      q: "Which models and providers are supported?",
      a: "The gateway supports models from OpenAI, Anthropic, Google (Gemini), xAI, DeepSeek, and Mistral through normalized provider adapters that hide provider-specific SDK differences behind a consistent API.",
    },
    {
      q: "Is the API OpenAI compatible?",
      a: "Yes. The gateway exposes OpenAI-compatible endpoints including /v1/chat/completions, /v1/responses, /v1/embeddings, and /v1/models. Existing applications using the OpenAI SDK can connect by changing the base URL and API key.",
    },
    {
      q: "How does model routing work?",
      a: "The routing engine evaluates versioned policies that score candidate models across cost, latency, reliability, capacity and tenant preferences. It uses stable SHA-256 hashing for consistent traffic distribution and supports circuit breakers for provider failure detection.",
    },
    {
      q: "What happens if a provider fails?",
      a: "The gateway operates in three resilience modes. NORMAL mode uses full intelligent scoring. DEGRADED mode disables experimentation while maintaining priority fallback. EMERGENCY mode bypasses dynamic routing for audited static fallback routes. Circuit breakers detect and isolate failing providers automatically.",
    },
    {
      q: "How is usage calculated?",
      a: "Credits are reserved synchronously before each request based on the model and maximum token limit. After execution, a settlement worker calculates exact provider cost and customer price, releases unspent credit holds, and posts balanced ledger entries. All financial values use integer minor units.",
    },
    {
      q: "Can I set spending or usage limits?",
      a: "Yes. Budget enforcement is part of the gateway security pipeline. Spending limits can be set per API key, per workspace, and per organization. The gateway fails closed with HTTP 402 when credit balance is insufficient.",
    },
    {
      q: "How are API keys secured?",
      a: "API keys are hashed using HMAC-SHA-256 with a server pepper of at least 32 bytes and compared in constant time. Key secrets are returned only once on creation or rotation. The gateway never stores, logs, or caches raw key values.",
    },
    {
      q: "Does GrowX AI support enterprise SSO?",
      a: "Enterprise authentication extensions including SAML, OIDC, and SCIM are on the roadmap and will attach via explicit extension points in the identity architecture. Contact us for enterprise requirements.",
    },
    {
      q: "Can GrowX AI be used with existing applications?",
      a: "Yes. Because the gateway exposes OpenAI-compatible APIs, existing applications can connect by updating the base URL to the GrowX endpoint and using a GrowX API key. No SDK changes or code modifications are required for basic integration.",
    },
  ];

  return (
    <section className="www-section">
      <h2 className="www-heading">FAQ</h2>
      <div className="www-faq">
        {items.map((item) => (
          <details key={item.q} className="www-faq-item">
            <summary>
              {item.q}
              <span className="www-faq-indicator">+</span>
            </summary>
            <div className="www-faq-answer">{item.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
