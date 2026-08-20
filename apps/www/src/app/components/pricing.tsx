export function Pricing() {
  return (
    <section className="www-section" id="pricing">
      <h2 className="www-heading">Pricing designed for usage</h2>
      <p className="www-body">GrowX AI uses a credit-based billing model with transparent, per-model pricing. Credits are reserved synchronously before each request and settled after provider execution with exact cost accounting.</p>
      <div className="www-pricing-features">
        <div className="www-pricing-feature">Integer minor-unit financial accounting with no floating-point arithmetic</div>
        <div className="www-pricing-feature">Synchronous credit reservation before provider execution</div>
        <div className="www-pricing-feature">Asynchronous settlement with exact provider cost and customer price</div>
        <div className="www-pricing-feature">Append-only balanced ledger entries</div>
        <div className="www-pricing-feature">Per-model and per-provider pricing transparency</div>
        <div className="www-pricing-feature">Independent reconciliation worker for divergence detection</div>
      </div>
      <a href="/contact" className="www-btn-ghost">Contact us</a>
    </section>
  );
}
