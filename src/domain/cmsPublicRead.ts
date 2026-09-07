/**
 * Pure CMS Public Read & Fallback Resolution Domain Helper
 *
 * Responsibilities:
 * - Purely overlays published localized CMS payloads on top of canonical Arabic content.
 * - Schema-aware: uses CMS_TRANSLATABLE_SCHEMA to distinguish translatable human text
 *   from technical invariants (IDs, URLs, dates, numbers, enums, person names).
 * - Deeply traverses objects and arrays (matching by entity id or index).
 * - Correctly overlays primitive string arrays (story.paragraphs, guide tips, committee responsibilities).
 * - Guarantees fail-safe fallback: missing entities or empty strings fallback to canonical Arabic.
 * - Zero React dependencies, zero Supabase dependencies, zero network calls.
 */

import { isCmsPathTranslatable } from './cmsTranslatableFields.ts';

export function overlayLocalizedCmsPayload<T>(
  canonicalPayload: T,
  localizedPayload: unknown,
  target?: string,
  currentPath = '',
): T {
  // 1. Nil canonical
  if (canonicalPayload === null || canonicalPayload === undefined) {
    return canonicalPayload;
  }

  // 2. String primitive
  if (typeof canonicalPayload === 'string') {
    // If target and path are provided, enforce allowlist check
    if (target && currentPath) {
      if (!isCmsPathTranslatable(target, currentPath)) {
        // Non-translatable technical string (image URL, ID, email, phone, raw date, enum)
        return canonicalPayload;
      }
    }

    if (typeof localizedPayload === 'string' && localizedPayload.trim().length > 0) {
      return localizedPayload as unknown as T;
    }
    if (
      typeof localizedPayload === 'object' &&
      localizedPayload !== null &&
      'value' in localizedPayload
    ) {
      const v = (localizedPayload as Record<string, unknown>).value;
      if (typeof v === 'string' && v.trim().length > 0) {
        return v as unknown as T;
      }
    }
    return canonicalPayload;
  }

  // 3. Numbers & booleans are strictly non-translatable technical values
  if (typeof canonicalPayload === 'number' || typeof canonicalPayload === 'boolean') {
    return canonicalPayload;
  }

  // 4. Missing or non-object localized payload -> return canonical
  if (
    localizedPayload === null ||
    localizedPayload === undefined ||
    typeof localizedPayload !== 'object'
  ) {
    return canonicalPayload;
  }

  // 5. Arrays
  if (Array.isArray(canonicalPayload)) {
    const locArray = Array.isArray(localizedPayload)
      ? (localizedPayload as unknown[])
      : Object.values(localizedPayload);

    // Check if canonical array is an array of primitives (e.g. string[])
    const isPrimitiveArray = canonicalPayload.some(
      (item) => item === null || typeof item !== 'object',
    );

    if (isPrimitiveArray) {
      // If target is specified, check if the array path itself or its element path is translatable
      return canonicalPayload.map((canonItem, index) => {
        const itemPath = currentPath ? `${currentPath}.${index}` : `${index}`;
        if (typeof canonItem === 'string') {
          if (target && !isCmsPathTranslatable(target, itemPath)) {
            // Technical string array (e.g. story.images, media URLs) -> preserve canonical
            return canonItem;
          }
          const locItem = locArray[index];
          if (typeof locItem === 'string' && locItem.trim().length > 0) {
            return locItem;
          }
          return canonItem;
        }
        return canonItem;
      }) as unknown as T;
    }

    // Array of entities (objects)
    const merged = canonicalPayload.map((canonItem, index) => {
      if (canonItem === null || typeof canonItem !== 'object') {
        return canonItem;
      }

      const itemId = (canonItem as { id?: unknown }).id;
      let matchedLoc: unknown = undefined;

      if (itemId !== undefined && itemId !== null && String(itemId).trim().length > 0) {
        matchedLoc = locArray.find(
          (loc) =>
            loc &&
            typeof loc === 'object' &&
            String((loc as { id?: unknown }).id) === String(itemId),
        );
      }

      if (!matchedLoc && locArray[index] && typeof locArray[index] === 'object') {
        const candidate = locArray[index] as { id?: unknown };
        if (!candidate.id || String(candidate.id) === String(itemId)) {
          matchedLoc = candidate;
        }
      }

      if (!matchedLoc) {
        return { ...canonItem };
      }

      const itemPath = currentPath ? `${currentPath}.${index}` : `${index}`;
      return overlayLocalizedCmsPayload(canonItem, matchedLoc, target, itemPath);
    });

    return merged as unknown as T;
  }

  // 6. Objects
  if (typeof canonicalPayload === 'object') {
    const canonObj = canonicalPayload as Record<string, unknown>;
    const locObj = localizedPayload as Record<string, unknown>;
    const result: Record<string, unknown> = { ...canonObj };

    for (const [key, canonVal] of Object.entries(canonObj)) {
      const propPath = currentPath ? `${currentPath}.${key}` : key;
      const locVal = locObj[key];

      if (locVal === undefined || locVal === null) {
        continue;
      }

      if (typeof canonVal === 'string') {
        if (target === 'contactCards' && key === 'value') {
          const cardId = String(canonObj.id ?? '');
          if (cardId === 'email' || cardId === 'phone') {
            result[key] = canonVal; // Technical invariant, never overlay!
            continue;
          }
          if (typeof locVal === 'string' && locVal.trim().length > 0) {
            result[key] = locVal;
            continue;
          }
        }

        if (target && !isCmsPathTranslatable(target, propPath)) {
          // Excluded technical string (e.g. image, photo, icon, email, phone, id, enum)
          result[key] = canonVal;
        } else if (typeof locVal === 'string' && locVal.trim().length > 0) {
          result[key] = locVal;
        }
      } else if (typeof canonVal === 'number' || typeof canonVal === 'boolean') {
        // Numbers and booleans always remain canonical
        result[key] = canonVal;
      } else if (Array.isArray(canonVal)) {
        if (Array.isArray(locVal)) {
          result[key] = overlayLocalizedCmsPayload(canonVal, locVal, target, propPath);
        }
      } else if (typeof canonVal === 'object') {
        result[key] = overlayLocalizedCmsPayload(canonVal, locVal, target, propPath);
      }
    }

    return result as T;
  }

  return canonicalPayload;
}
