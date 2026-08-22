export function Footer() {
  return (
    <footer className="www-footer">
      <div className="www-footer-links">
        <a href="/docs" className="www-footer-link">
          Docs
        </a>
        <a href="/api" className="www-footer-link">
          API
        </a>
        <a href="/models" className="www-footer-link">
          Models
        </a>
        <a href="/status" className="www-footer-link">
          Status
        </a>
        <a href="https://github.com/growxlabs" className="www-footer-link">
          GitHub
        </a>
      </div>
      <div className="www-footer-bottom">
        <span>{"\u00A9"} GrowX AI</span>
        <div className="www-footer-legal">
          <a href="/security" className="www-footer-link">
            Security
          </a>
          <a href="/privacy" className="www-footer-link">
            Privacy
          </a>
          <a href="/terms" className="www-footer-link">
            Terms
          </a>
        </div>
      </div>
    </footer>
  );
}
