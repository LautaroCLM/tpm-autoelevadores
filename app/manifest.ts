import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TPM Autoelevadores',
    short_name: 'TPM Elevadores',
    description: 'Digitalización de mantenimiento preventivo diario (TPM Nivel 1) para autoelevadores industriales',
    start_url: '/',
    display: 'standalone',
    background_color: '#090d16',
    theme_color: '#f59e0b',
    icons: [
      {
        src: '/icon-192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
      },
      {
        src: '/icon-512.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
      },
    ],
  };
}
