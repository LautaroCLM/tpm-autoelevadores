export interface CompressImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

/**
 * Redimensiona y comprime una imagen en el navegador utilizando un elemento <canvas>.
 * - Limita las dimensiones a un máximo de 1280x720 px (o 720x1280 px si es vertical),
 *   manteniendo la relación de aspecto original sin recortar ni deformar la imagen.
 * - Re-codifica la imagen en formato JPEG con calidad 0.75 (o la especificada).
 * - Devuelve el string data URL (Base64) de la imagen optimizada.
 */
export async function compressImage(
  file: File | Blob,
  options: CompressImageOptions = {}
): Promise<string> {
  const {
    maxWidth = 1280,
    maxHeight = 720,
    quality = 0.75,
  } = options;

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('compressImage solo puede ejecutarse en el entorno del navegador'));
    }

    if (!file.type.startsWith('image/')) {
      return reject(new Error('El archivo seleccionado no es una imagen válida.'));
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const naturalWidth = img.naturalWidth || img.width;
      const naturalHeight = img.naturalHeight || img.height;

      if (!naturalWidth || !naturalHeight) {
        return reject(new Error('No se pudieron obtener las dimensiones de la imagen.'));
      }

      // Ajustar límites según la orientación (apaisada vs. vertical) para mantener proporción 720p
      const isLandscape = naturalWidth >= naturalHeight;
      const boundWidth = isLandscape ? maxWidth : maxHeight;
      const boundHeight = isLandscape ? maxHeight : maxWidth;

      // Calcular factor de reducción proporcional (no agranda imágenes más pequeñas)
      let scale = 1;
      if (naturalWidth > boundWidth || naturalHeight > boundHeight) {
        scale = Math.min(boundWidth / naturalWidth, boundHeight / naturalHeight);
      }

      const targetWidth = Math.max(1, Math.round(naturalWidth * scale));
      const targetHeight = Math.max(1, Math.round(naturalHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('No se pudo inicializar el contexto 2D del canvas.'));
      }

      // Máxima calidad de filtrado bilineal/bicúbico para no perder nitidez en detalles mecánicos
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      try {
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Error al cargar la imagen para compresión.'));
    };

    img.src = objectUrl;
  });
}
