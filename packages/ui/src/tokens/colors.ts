export const growxPalette = {
  obsidian: { 900: "#07090D", 800: "#0B0F14", 700: "#11161D", 600: "#161D26", 500: "#1C2430", 400: "#232B38", 300: "#2B3442", 200: "#343D4D", 100: "#3E485B" },
  frost: { 100: "#F7FAFF", 200: "#EDF2F8", 300: "#E1E7F0", 400: "#C9D2DF", 500: "#A8B4C6", 600: "#8892A3", 700: "#6B7687" },
  ice: { 100: "#F0F7FF", 200: "#E1F0FF", 300: "#C7E4FF", 400: "#A9D6FF", 500: "#7FB8FF", 600: "#5C98E6", 700: "#3E78C7", 800: "#275A99" },
  health: { 100: "#ECFDF5", 300: "#6EE7B7", 500: "#34D399", 700: "#059669", 900: "#064E3B" },
  warning: { 100: "#FFF8EB", 300: "#FDE68A", 500: "#FBBF24", 700: "#D97706", 900: "#7C2D12" },
  critical: { 100: "#FEF2F2", 300: "#FCA5A5", 500: "#FB6A6A", 700: "#DC2626", 900: "#7F1D1D" },
  information: { 100: "#EFF6FF", 300: "#93C5FD", 500: "#3B82F6", 700: "#1D4ED8", 900: "#1E3A8A" },
} as const;

export const colorTokens = {
  background: { canvas: growxPalette.obsidian[900], shell: growxPalette.obsidian[800] },
  surface: { primary: growxPalette.obsidian[700], raised: growxPalette.obsidian[600], hover: growxPalette.obsidian[500], active: growxPalette.obsidian[400] },
  border: { subtle: growxPalette.obsidian[500], default: growxPalette.obsidian[300], strong: growxPalette.obsidian[200], focus: growxPalette.ice[500] },
  text: { primary: growxPalette.frost[100], strong: growxPalette.frost[200], secondary: growxPalette.frost[400], supporting: growxPalette.frost[500], muted: growxPalette.frost[600], disabled: growxPalette.frost[700] },
  accent: { signature: growxPalette.ice[500], soft: growxPalette.ice[300], strong: growxPalette.ice[600] },
  status: { health: growxPalette.health[500], warning: growxPalette.warning[500], critical: growxPalette.critical[500], information: growxPalette.information[500] },
} as const;
