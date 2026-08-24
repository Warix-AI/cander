import type { Metadata, Viewport } from "next";
import Script from "next/script";
import {
  DM_Sans,
  Geist_Mono,
  IBM_Plex_Sans,
  Inter,
  Newsreader,
  Source_Serif_4,
  Space_Grotesk,
} from "next/font/google";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlex = IBM_Plex_Sans({
  variable: "--font-ibm-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://getcourier.ai"),
  title: {
    default: "Courier",
    template: "%s | Courier",
  },
  description:
    "One AI product to chat, work, build, research, create, and run production AI — in the cloud, locally, or on your device.",
  applicationName: "Courier",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Courier",
  },
  icons: {
    icon: [
      { url: "/courier-mark-light.png", media: "(prefers-color-scheme: light)" },
      { url: "/courier-mark-dark.png", media: "(prefers-color-scheme: dark)" },
    ],
    apple: "/courier-mark-light.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

const themeScript = `(function(){try{var a=localStorage.getItem('courier-appearance-v2');var theme=null;if(a){try{var j=JSON.parse(a);if(typeof j.color==='number'){theme=j.color<45?'light':'dark'}}catch(e){}}if(!theme){var t=localStorage.getItem('theme');theme=t==='dark'?'dark':t==='light'?'light':'light'}if(theme==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(e){document.documentElement.classList.remove('dark')}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${geistMono.variable} ${inter.variable} ${spaceGrotesk.variable} ${ibmPlex.variable} ${sourceSerif.variable} ${newsreader.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script
          id="courier-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body className="min-h-svh overflow-x-hidden overflow-y-auto bg-background font-sans text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
