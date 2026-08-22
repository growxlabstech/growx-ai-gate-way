import type { Metadata } from "next";
import "@growx/ui/tokens.css";
import "@growx/ui/styles.css";
import "./styles.css";
import "./admin-shell-overrides.css";
export const metadata: Metadata = {
  title: "GrowX Admin",
  description: "GrowX AI Gateway",
};
export const dynamic = "force-dynamic";
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
