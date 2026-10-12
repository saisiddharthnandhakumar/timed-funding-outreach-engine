import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Funding Outreach Engine", template: "%s · Funding Outreach Engine" },
  description: "Find the best new Indian startup funding announcements, understand why they fit your thesis, and review the outreach.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121214" },
  ],
};

// Runs before paint: saved theme wins, otherwise follow the OS; restores the sidebar state. Avoids any flash.
const INIT = `try{var d=document.documentElement,t=localStorage.getItem("theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))d.classList.add("dark");if(localStorage.getItem("sidebar")==="collapsed")d.setAttribute("data-sidebar","collapsed")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INIT }} />
      </head>
      <body className="min-h-screen bg-bg text-ink antialiased">{children}</body>
    </html>
  );
}
