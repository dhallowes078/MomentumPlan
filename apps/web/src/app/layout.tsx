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
            __html: `(function(){try{var t=JSON.parse(localStorage.getItem("momentum_theme")||"null");if(!t||!t.themeColor)return;var r=document.documentElement,hex=t.themeColor,dark=!!t.darkMode;r.dataset.theme=dark?"dark":"light";function parse(h){h=String(h).replace("#","");if(h.length===3)h=h.split("").map(function(c){return c+c}).join("");var n=parseInt(h,16);if(isNaN(n))n=0x1f4d3a;return[(n>>16)&255,(n>>8)&255,n&255]}function hsl(r,g,b){r/=255;g/=255;b/=255;var max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2,s=0,h=0;if(max!==min){var d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);if(max===r)h=((g-b)/d+(g<b?6:0))/6;else if(max===g)h=((b-r)/d+2)/6;else h=((r-g)/d+4)/6}return[h*360,s,l]}function toHex(h,s,l){h=((h%360)+360)%360;s=Math.min(1,Math.max(0,s));l=Math.min(1,Math.max(0,l));var c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2,rp=0,gp=0,bp=0;if(h<60){rp=c;gp=x}else if(h<120){rp=x;gp=c}else if(h<180){gp=c;bp=x}else if(h<240){gp=x;bp=c}else if(h<300){rp=x;bp=c}else{rp=c;bp=x}function z(n){return Math.round((n+m)*255).toString(16).padStart(2,"0")}return"#"+z(rp)+z(gp)+z(bp)}var rgb=parse(hex),hs=hsl(rgb[0],rgb[1],rgb[2]),h=hs[0],sat=Math.min(0.55,Math.max(0.18,hs[1])),ah=(h+34)%360,bg,bge,ink,inkm,acc,line;if(dark){bg=toHex(h,sat*0.55,0.08);bge=toHex(h,sat*0.5,0.13);ink=toHex(h,sat*0.25,0.92);inkm=toHex(h,sat*0.28,0.68);acc=toHex(ah,0.62,0.58);line="hsla("+Math.round(h)+",18%,88%,0.12)"}else{bg=toHex(h,sat*0.45,0.93);bge=toHex(h,sat*0.35,0.97);ink=toHex(h,Math.min(0.45,Math.max(0.2,sat*0.75)),0.14);inkm=toHex(h,sat*0.4,0.36);acc=toHex(ah,0.68,0.46);line="hsla("+Math.round(h)+",22%,18%,0.12)"}r.style.setProperty("--brand",hex);r.style.setProperty("--bg",bg);r.style.setProperty("--bg-elevated",bge);r.style.setProperty("--ink",ink);r.style.setProperty("--ink-muted",inkm);r.style.setProperty("--accent",acc);r.style.setProperty("--line",line);r.style.setProperty("--card-bg","color-mix(in srgb, "+bge+" 90%, "+(dark?"black":"white")+")")}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${sans.variable} ${display.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
