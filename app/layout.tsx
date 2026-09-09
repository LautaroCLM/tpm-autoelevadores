import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Header } from '../components/Header';
import { OfflineIndicator } from '../components/OfflineIndicator';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'TPM Autoelevadores | Mantenimiento Preventivo Nivel 1',
  description: 'Digitalización del checklist TPM Nivel 1 para autoelevadores industriales',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TPM Elevadores',
  },
};

export const viewport: Viewport = {
  themeColor: '#090d16',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="bg-[#090d16] text-slate-100 min-h-screen flex flex-col antialiased selection:bg-amber-500 selection:text-slate-950">
        <OfflineIndicator />
        <Header />
        <main className="flex-1 flex flex-col">{children}</main>
        <Toaster position="top-right" richColors theme="dark" />
      </body>
    </html>
  );
}
