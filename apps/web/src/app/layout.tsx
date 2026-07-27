import type { Metadata, Viewport } from "next";
import { Outfit, Fraunces } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const sans = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
});

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Momentum",
  description: "Motion-style personal task scheduler with Outlook auto-planning",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Momentum",
  },
};

export const viewport: Viewport = {
  themeColor: "#1f4d3a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=JSON.parse(localStorage.getItem("momentum_theme")||"null");if(!t)return;var r=document.documentElement;r.dataset.theme=t.darkMode?"dark":"light";if(t.themeColor){r.style.setProperty("--brand",t.themeColor)}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${sans.variable} ${display.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
