export function Hero() {
  return (
    <section className="www-hero" id="gateway">
      <div className="www-announcement">
        <span className="www-announcement-badge">New</span>
        One gateway for production AI
      </div>
      <div className="www-product-marker">
        <span className="www-product-marker-badge">GX</span>
        <span className="www-product-marker-label">GATEWAY</span>
      </div>
      <h1 className="www-headline">
        One gateway.
        <br />
        Every model.
        <br />
        Production control.
      </h1>
      <p className="www-hero-body">
        Connect your applications to one API and route across leading AI models
        with policy controls, observability, usage accounting, fallbacks and
        enterprise governance.
      </p>
      <div className="www-providers">
        <span className="www-provider">OpenAI</span>
        <span className="www-provider">Anthropic</span>
        <span className="www-provider">Google</span>
        <span className="www-provider">xAI</span>
        <span className="www-provider">DeepSeek</span>
        <span className="www-provider">Mistral</span>
      </div>
      <div className="www-hero-actions">
        <a href="/sign-up" className="www-btn">
          Get API key {"\u2192"}
        </a>
        <a href="/docs" className="www-link-accent">
          Read the docs
        </a>
      </div>
      <p className="www-supporting">
        OpenAI-compatible APIs{" "}
        <span className="www-supporting-sep">{"\u00B7"}</span> streaming{" "}
        <span className="www-supporting-sep">{"\u00B7"}</span> tool calls{" "}
        <span className="www-supporting-sep">{"\u00B7"}</span> routing{" "}
        <span className="www-supporting-sep">{"\u00B7"}</span> fallbacks{" "}
        <span className="www-supporting-sep">{"\u00B7"}</span> usage controls
      </p>
    </section>
  );
}
