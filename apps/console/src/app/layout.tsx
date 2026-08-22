import type { Metadata } from "next";
import "@growx/ui/tokens.css";
import "@growx/ui/styles.css";
import "./styles.css";
import "./phase3.css";

export const metadata: Metadata = {
  title: "GrowX Console",
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
