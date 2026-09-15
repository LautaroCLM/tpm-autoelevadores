import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tpmautoelevadores.app',
  appName: 'TPM Autoelevadores',
  webDir: 'public',
  server: {
    url: 'https://tpm-autoelevadores.vercel.app',
    cleartext: false
  }
};

export default config;
