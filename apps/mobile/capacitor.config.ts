import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'kz.egin.app', appName: 'EGIN', webDir: 'dist',
  backgroundColor: '#ffffff',
  ios: { contentInset: 'never', preferredContentMode: 'mobile' },
  android: { backgroundColor: '#ffffff' },
  plugins: { CapacitorHttp: { enabled: true }, CapacitorPasskey: { origin: 'https://egin.perricheno.com', domains: ['egin.perricheno.com'], autoShim: true }, SystemBars: { style: 'LIGHT', insetsHandling: 'css', initialViewportFitValueHint: 'cover' } },
};
export default config;
