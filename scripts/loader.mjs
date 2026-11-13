import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') {
    return nextResolve('next/server.js', context);
  }
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' && (specifier.startsWith('./') || specifier.startsWith('../'))) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const targetPath = path.resolve(parentDir, specifier);
      if (fs.existsSync(targetPath + '.ts')) {
        return nextResolve(specifier + '.ts', context);
      }
      if (fs.existsSync(targetPath + '.tsx')) {
        return nextResolve(specifier + '.tsx', context);
      }
      if (fs.existsSync(path.join(targetPath, 'index.ts'))) {
        return nextResolve(specifier + '/index.ts', context);
      }
    }
    throw err;
  }
}
