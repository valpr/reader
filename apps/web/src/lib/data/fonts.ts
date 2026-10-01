/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

export enum LocalFont {
  KZUDGOTHIC = 'KZ UDGothic',
  KZUDMINCHO = 'KZ UDMincho',
  GENEI = 'Genei Koburi Mincho v5',
  KLEEONE = 'Klee One',
  KLEEONESEMIBOLD = 'Klee One SemiBold',
  NOTOSANSJP = 'Noto Sans JP',
  NOTOSERIFJP = 'Noto Serif JP',
  SHIPPORIMINCHO = 'Shippori Mincho',
  SERIF = 'Serif',
  SANSSERIF = 'Sans-Serif'
}

export interface UserFont {
  name: string;
  path: string;
  fileName: string;
}

export const userFontsCacheName = 'reader-userfonts';
export const legacyUserFontsCacheName = 'ttu-userfonts';

/**
 * Seamlessly migrates cached user fonts from the legacy 'ttu-userfonts' cache
 * to 'reader-userfonts' to prevent data loss upon upgrading.
 */
export async function migrateUserFontsCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const hasLegacy = await caches.has(legacyUserFontsCacheName);
    if (!hasLegacy) return;

    const legacyCache = await caches.open(legacyUserFontsCacheName);
    const requests = await legacyCache.keys();
    if (requests.length > 0) {
      const targetCache = await caches.open(userFontsCacheName);
      for (const request of requests) {
        const response = await legacyCache.match(request);
        if (response) {
          await targetCache.put(request, response);
        }
      }
    }
    await caches.delete(legacyUserFontsCacheName);
  } catch {
    // Best effort migration: do not interrupt app launch if cache access fails
  }
}

export const reservedFontNames = new Set([
  'KZ UDGothic',
  'KZ UDMincho',
  'Genei Koburi Mincho v5',
  'Klee One',
  'Klee One SemiBold',
  'Noto Sans JP',
  'Noto Serif JP',
  'Shippori Mincho',
  'Serif',
  'Sans-Serif'
]);

export function isStoredFont(fontName: string, userFonts: UserFont[]) {
  return (
    reservedFontNames.has(fontName) || !!userFonts.find((userFont) => userFont.name === fontName)
  );
}
