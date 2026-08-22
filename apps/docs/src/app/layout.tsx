import type { Metadata } from "next";
import "@growx/ui/tokens.css";
import "./styles.css";
export const metadata: Metadata = {
  title: "GrowX Docs",
  description: "GrowX AI Gateway",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
