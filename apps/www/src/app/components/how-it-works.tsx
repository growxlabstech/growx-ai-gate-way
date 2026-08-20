const steps = [
  {
    num: "1",
    title: "Create a workspace",
    body: "Establish an <strong>isolated environment</strong> for your application with its own API keys, policies, and usage boundaries.",
  },
  {
    num: "2",
    title: "Create an API key",
    body: "Issue <strong>scoped credentials</strong> with the required permissions, model access, rate limits, and spending controls.",
  },
  {
    num: "3",
    title: "Connect the Gateway",
    body: "Point your application to the GrowX endpoint. Use the <strong>OpenAI-compatible API</strong> — no SDK changes required.",
  },
  {
    num: "4",
    title: "Select a model or policy",
    body: "Request a <strong>specific model</strong> or allow the routing policy to choose based on cost, latency, and availability.",
  },
  {
    num: "5",
    title: "Observe every request",
    body: "Inspect <strong>latency, tokens, routing decisions, cost</strong> and provider behavior for every request.",
  },
];

export function HowItWorks() {
  return (
    <section className="www-section">
      <h2 className="www-heading">How GrowX AI works</h2>
      <p className="www-body">
        Integrate in five steps. Each step builds on the previous to give you complete control over AI model access.
      </p>
      <div className="www-steps">
        {steps.map((s) => (
          <div key={s.num} className="www-step">
            <span className="www-step-num">[{s.num}]</span>
            <div>
              <p className="www-step-title">{s.title}</p>
              <p
                className="www-step-body"
                dangerouslySetInnerHTML={{ __html: s.body }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
