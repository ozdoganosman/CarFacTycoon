import type { CapacitorConfig } from '@capacitor/cli';

// The Android app (Google Play): the game's `--mode app` build inside a native shell.
// appId is the app's permanent identity on Google Play: it cannot change after the first upload.
const config: CapacitorConfig = {
  appId: 'io.github.ozdoganosman.carfactycoon',
  appName: 'CarFacTycoon',
  webDir: 'dist-app',
  android: {
    // Release builds do not expose the page to Chrome's inspector.
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      // The game hides it on its first frame (src/native/native.ts); this is only the fallback.
      launchAutoHide: true,
      launchShowDuration: 3000,
      backgroundColor: '#26241f',
      showSpinner: false,
    },
    SystemBars: {
      // Notch and rounded-corner insets as CSS variables (used in src/native/native.css).
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
