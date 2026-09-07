import type { Metadata, Viewport } from "next";
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
import { APP_ORIGIN } from "@/lib/app-brand";
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
  metadataBase: new URL(APP_ORIGIN),
  title: {
    default: "Cander",
    template: "%s | Cander",
  },
  description:
    "One AI product to chat, work, build, research, create, and run production AI — in the cloud, locally, or on your device.",
  applicationName: "Cander",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Cander",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png?v=7", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png?v=7", sizes: "16x16", type: "image/png" },
      { url: "/cander-mark.png?v=7", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png?v=7", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicon-32.png?v=7",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "overlays-content",
  // App theme owns chrome; ThemeProvider syncs theme-color after hydration.
  themeColor: "#ffffff",
  colorScheme: "light",
};

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
      <body
        className="min-h-svh overflow-x-hidden overflow-y-auto bg-background font-sans text-foreground"
        suppressHydrationWarning
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
