import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Header } from '../components/Header';
import { OfflineIndicator } from '../components/OfflineIndicator';
import { Toaster } from 'sonner';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

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
  themeColor: '#0b0f17',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} dark`}>
      <body className="bg-[#0b0f17] text-slate-100 min-h-dvh flex flex-col font-sans antialiased selection:bg-amber-500 selection:text-slate-950">
        <OfflineIndicator />
        <Header />
        <main className="flex-1 flex flex-col">{children}</main>
        <Toaster position="top-right" richColors theme="dark" />
      </body>
    </html>
  );
}

