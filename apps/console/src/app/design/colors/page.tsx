import { growxPalette } from "@growx/ui";
import styles from "./palette.module.css";

const families = [
  { key: "obsidian", title: "Obsidian", role: "Foundation", values: growxPalette.obsidian },
  { key: "frost", title: "Frost", role: "Information / typography", values: growxPalette.frost },
  { key: "ice", title: "GrowX Ice", role: "Signature family", values: growxPalette.ice },
] as const;

const operational = [
  { key: "health", title: "Health", values: growxPalette.health },
  { key: "warning", title: "Warning", values: growxPalette.warning },
  { key: "critical", title: "Critical", values: growxPalette.critical },
  { key: "information", title: "Information", values: growxPalette.information },
] as const;

function readableText(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  const luminance = (((value >> 16) & 255) * 299 + ((value >> 8) & 255) * 587 + (value & 255) * 114) / 1000;
  return luminance > 150 ? "var(--gx-obsidian-900)" : "var(--gx-frost-100)";
}

function Swatches({ values, compact = false }: { values: Readonly<Record<number, string>>; compact?: boolean }) {
  return <div className={`${styles.swatches} ${compact ? styles.compact : ""}`}>{Object.entries(values).map(([shade, hex]) => <div className={styles.swatch} key={shade} style={{ background: hex, color: readableText(hex) }}><span>{shade}</span><code>{hex}</code><small>{`--gx-${shade}`}</small></div>)}</div>;
}

export default function ColorsPage() {
  return <main className={styles.page}>
    <header className={styles.hero}><h1>GROW<span>X</span> AI</h1><p>Color system</p><small>Obsidian × Ice × Frost</small><div className={styles.locked}>Approved palette · Locked</div></header>
    {families.map((family, index) => <section className={styles.section} key={family.key}><header><h2>{String(index + 1).padStart(2, "0")} — {family.title}</h2><p>{family.role}</p></header><Swatches values={family.values} />{family.key === "ice" ? <div className={styles.signature}>GrowX Ice signature <strong>{growxPalette.ice[500]}</strong></div> : null}</section>)}
    <section className={styles.section}><header><h2>04 — Operational colors</h2><p>Semantic state only</p></header><div className={styles.operational}>{operational.map((family) => <article key={family.key}><h3>{family.title}</h3><Swatches values={family.values} compact /></article>)}</div></section>
    <section className={styles.section}><header><h2>05 — Contrast pairs</h2><p>Approved high-contrast compositions</p></header><div className={styles.pairs}>
      {([
        ["Obsidian + Frost", growxPalette.obsidian[800], growxPalette.frost[300]],
        ["Obsidian + GrowX Ice", growxPalette.obsidian[800], growxPalette.ice[500]],
        ["Raised Obsidian + Frost", growxPalette.obsidian[500], growxPalette.frost[200]],
        ["GrowX Ice + Deep Obsidian", growxPalette.ice[500], growxPalette.obsidian[800]],
        ["Obsidian + Health", growxPalette.obsidian[800], growxPalette.health[500]],
        ["Obsidian + Warning", growxPalette.obsidian[800], growxPalette.warning[500]],
        ["Obsidian + Critical", growxPalette.obsidian[800], growxPalette.critical[500]],
      ] as Array<[string, string, string]>).map(([label, left, right]) => <article key={label}><h3>{label}</h3><div><span style={{background:left,color:readableText(left)}}>{left}</span><span style={{background:right,color:readableText(right)}}>{right}</span></div></article>)}
    </div></section>
    <footer><span>Implementation source</span><code>@growx/ui · growxPalette · tokens.css</code></footer>
  </main>;
}
