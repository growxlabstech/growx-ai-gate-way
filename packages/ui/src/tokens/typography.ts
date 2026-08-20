export const typographyTokens = {
  family: { sans: '"Manrope", ui-sans-serif, system-ui, sans-serif', mono: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace' },
  scale: {
    display: { size: "36px", weight: 700, lineHeight: 1.05, tracking: "-0.035em" },
    pageTitle: { size: "30px", weight: 650, lineHeight: 1.1, tracking: "-0.025em" },
    section: { size: "22px", weight: 600, lineHeight: 1.2, tracking: "-0.015em" },
    panel: { size: "16px", weight: 600, lineHeight: 1.3 }, body: { size: "14px", weight: 400, lineHeight: 1.5 },
    denseBody: { size: "13px", weight: 400, lineHeight: 1.42 }, label: { size: "12px", weight: 500, lineHeight: 1.35 },
    metadata: { size: "12px", weight: 400, lineHeight: 1.4 }, micro: { size: "11px", weight: 500, lineHeight: 1.3 },
    code: { size: "13px", weight: 400, lineHeight: 1.55 },
  },
} as const;
