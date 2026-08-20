import styles from "./typography.module.css";

const scale = [
  ["Display", "36 / 700 / 1.05", "AI Gateway Infrastructure", styles.display],
  ["Page title", "30 / 650 / 1.10", "Workspaces", styles.pageTitle],
  ["Section", "22 / 600 / 1.20", "Provider health", styles.sectionTitle],
  ["Panel", "16 / 600 / 1.30", "Active routing policy", styles.panelTitle],
  ["Body", "14 / 400 / 1.50", "GrowX routes every request through policy, capacity, health, and budget checks before provider execution.", styles.body],
  ["Dense body", "13 / 400 / 1.42", "Traffic is using the configured fallback route with no customer-visible interruption.", styles.dense],
  ["Label", "12 / 500 / 1.35", "API key name", styles.label],
  ["Metadata", "12 / 400 / 1.40", "Last evaluated 4 minutes ago · Policy version 18", styles.metadata],
  ["Micro", "11 / 500 / 1.30", "PRODUCTION", styles.micro],
] as const;

const metrics = [
  ["Requests", "1,284,921"],
  ["Availability", "99.99%"],
  ["P95 latency", "342ms"],
  ["Spend", "$1,284.92"],
] as const;

export default function TypographyPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.brand}><span>G</span><strong>GrowX AI</strong></div>
        <p className={styles.eyebrow}>Design foundation · Typography</p>
        <h1>Precision in every character.</h1>
        <div className={styles.locked}><span>02</span><strong>Locked source of truth</strong><span>Manrope × JetBrains Mono</span></div>
      </header>

      <section className={styles.section}>
        <header className={styles.sectionHeader}><div><span>01</span><h2>Primary UI family</h2></div><p>Manrope carries every product interface, navigation label, control, table, and operational surface.</p></header>
        <div className={styles.familySpecimen}>
          <div><span>MANROPE</span><strong>Aa</strong></div>
          <div><p>GrowX AI Gateway</p><p>ABCDEFGHIJKLMNOPQRSTUVWXYZ</p><p>abcdefghijklmnopqrstuvwxyz</p><p>0123456789</p></div>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}><div><span>02</span><h2>Product type scale</h2></div><p>Dense, deliberate hierarchy without marketing-sized headings inside the application.</p></header>
        <div className={styles.scale}>{scale.map(([name, spec, sample, className]) => <article key={name}><header><strong>{name}</strong><span>{spec}</span></header><p className={className}>{sample}</p></article>)}</div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}><div><span>03</span><h2>Developer family</h2></div><p>JetBrains Mono is reserved for code, identifiers, request metadata, routes, and technical values.</p></header>
        <div className={styles.codeSpecimen}>
          <header><span>JETBRAINS MONO · 13 / 400 / 1.55</span><span>TypeScript</span></header>
          <pre><code>{`const response = await growx.responses.create({\n  model: "growx/smart",\n  input: "Summarize provider health",\n});`}</code></pre>
          <div><code>req_01HZX8K7M3NQ2YFB0R4W6C9T</code><code>POST /v1/responses</code><code>trace_7f34c9d8a102</code></div>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}><div><span>04</span><h2>Operational numerals</h2></div><p>Usage, credits, billing, latency, token counts, and table numbers use tabular figures.</p></header>
        <div className={styles.metrics}>{metrics.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      </section>

      <footer className={styles.review}><span>Foundation status</span><strong>Typography approved and implemented.</strong><p>Next mandatory foundation: spacing, followed by grid and layout.</p></footer>
    </main>
  );
}
