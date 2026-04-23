import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'kz.egin.aginmap',
  appName: 'Egin Map',
  webDir: 'out',
  bundledWebRuntime: false,
  plugins: {
    GoogleMaps: {
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#1a1a1a'
    }
  }
};

export default config;
