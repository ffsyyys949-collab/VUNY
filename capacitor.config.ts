import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zeio.app',
  appName: 'ZE.io',
  webDir: 'dist',
  backgroundColor: '#0A0A0A',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#0A0A0A',
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0A0A0A',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0A0A0A',
    },
  },
};

export default config;
