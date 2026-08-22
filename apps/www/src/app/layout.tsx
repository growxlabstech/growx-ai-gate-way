import type { Metadata } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import "@growx/ui/tokens.css";
import "./styles.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--gx-font-manrope" });
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--gx-font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "GrowX AI — One Gateway for Production AI",
  description:
    "Connect your applications to one API and route across leading AI models with policy controls, observability, usage accounting, fallbacks and enterprise governance.",
  openGraph: {
    title: "GrowX AI — One Gateway for Production AI",
    description:
      "One gateway. Every model. Production control. Access, route, control, observe, and govern AI models through one API.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${manrope.variable} ${jetBrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
