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
  // App theme owns chrome; init script rewrites theme-color to match appearance.
  themeColor: "#ffffff",
  colorScheme: "light",
};

const themeScript = `(function(){try{var a=localStorage.getItem('courier-appearance-v2');var theme=null;if(a){try{var j=JSON.parse(a);if(j.colorMode==='dark'||j.colorMode==='dark-charcoal'||j.colorMode==='dark-blue'){theme='dark'}else if(j.colorMode==='light'||j.colorMode==='light-blue'){theme='light'}else if(typeof j.color==='number'){theme=j.color<45?'light':'dark'}}catch(e){}}if(!theme){var t=localStorage.getItem('theme');theme=t==='dark'?'dark':t==='light'?'light':null}if(!theme){theme=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}var root=document.documentElement;var bg=theme==='dark'?'#000000':'#ffffff';if(theme==='dark'){root.classList.add('dark')}else{root.classList.remove('dark')}root.style.colorScheme=theme;root.style.backgroundColor=bg;if(document.body){document.body.style.backgroundColor=bg}var meta=document.querySelector('meta[name="color-scheme"]');if(!meta){meta=document.createElement('meta');meta.setAttribute('name','color-scheme');document.head.appendChild(meta)}meta.setAttribute('content',theme);var color=bg;var tags=document.querySelectorAll('meta[name="theme-color"]');if(tags.length){tags.forEach(function(tag){tag.removeAttribute('media');tag.setAttribute('content',color)})}else{var tc=document.createElement('meta');tc.setAttribute('name','theme-color');tc.setAttribute('content',color);document.head.appendChild(tc)}}catch(e){document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';document.documentElement.style.backgroundColor='#ffffff'}})();`;

const mobileShellScript = `(function(){try{var ua=navigator.userAgent||'';if(/\\bCapacitor\\b/i.test(ua)||(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())){document.documentElement.classList.add('cander-mobile')}}catch(e){}})();`;

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
        <Script
          id="cander-mobile-shell-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: mobileShellScript }}
        />
      </head>
      <body className="min-h-svh overflow-x-hidden overflow-y-auto bg-background font-sans text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
