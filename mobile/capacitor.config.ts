/**
 * Thin native shell — loads the hosted (or local) Cander web app.
 * Same idea as desktop/ Electron: product UI stays in Next.js.
 *
 * Typed loosely so the root Next.js build never needs @capacitor/cli.
 */
const START_URL = process.env.CANDER_URL || "https://cander.app";
const isLocalHttp = /^http:\/\//i.test(START_URL);

const config = {
  appId: "ai.warix.cander",
  appName: "Cander",
  webDir: "www",
  server: {
    url: START_URL,
    cleartext: isLocalHttp,
    allowNavigation: [
      "cander.app",
      "*.cander.app",
      "localhost",
      "127.0.0.1",
      "10.0.2.2",
    ],
  },
  plugins: {
    Keyboard: {
      // WebView stays full-height; we lift the composer via --keyboard-inset.
      resize: "none",
      resizeOnFullScreen: true,
    },
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
  },
  android: {
    allowMixedContent: isLocalHttp,
  },
};

export default config;
