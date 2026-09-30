'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: React.ReactNode;
}

/**
 * Componente ModalPortal
 * Teleporta el contenido de los modales directamente al <body> del documento.
 * Esto evita que las reglas de stacking context, transform, filter o position: relative
 * de componentes padres atrapen el modal, garantizando que siempre quede fijo en el
 * centro exacto de la pantalla (viewport) del usuario, cubriendo el header y respetando
 * dispositivos móviles y computadoras.
 */
export const ModalPortal: React.FC<ModalPortalProps> = ({ children }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof window === 'undefined') return null;

  return createPortal(children, document.body);
};
