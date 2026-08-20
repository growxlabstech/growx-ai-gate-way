"use client";
import { useState } from "react";

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <header className="www-header">
      <div className="www-header-inner">
        <a href="/" className="www-wordmark">GROWX AI</a>
        <nav className="www-nav">
          <a href="#models" className="www-nav-link">Models</a>
          <a href="#gateway" className="www-nav-link">Gateway</a>
          <a href="/docs" className="www-nav-link">Docs</a>
          <a href="#pricing" className="www-nav-link">Pricing</a>
          <a href="#enterprise" className="www-nav-link">Enterprise</a>
          <a href="/sign-in" className="www-nav-link">Sign in</a>
        </nav>
        <div className="www-header-actions">
          <a href="/sign-up" className="www-btn">Get API Key</a>
        </div>
        <button className="www-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu" aria-expanded={mobileOpen}>
          {mobileOpen ? "\u2715" : "\u2630"}
        </button>
      </div>
      <div className="www-mobile-nav" data-open={mobileOpen}>
        <nav className="www-nav">
          <a href="#models" className="www-nav-link">Models</a>
          <a href="#gateway" className="www-nav-link">Gateway</a>
          <a href="/docs" className="www-nav-link">Docs</a>
          <a href="#pricing" className="www-nav-link">Pricing</a>
          <a href="#enterprise" className="www-nav-link">Enterprise</a>
          <a href="/sign-in" className="www-nav-link">Sign in</a>
          <a href="/sign-up" className="www-btn">Get API Key</a>
        </nav>
      </div>
    </header>
  );
}
