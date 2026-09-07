/**
 * Pure CMS Public Read & Fallback Resolution Domain Helper
 *
 * Responsibilities:
 * - Purely overlays published localized CMS payloads on top of canonical Arabic content.
 * - Deeply traverses objects and arrays (matching by entity id or index).
 * - Preserves technical invariants (IDs, URLs, dates, numbers, enums, names) from canonical source.
 * - Guarantees fail-safe fallback: missing entities or empty strings fallback to canonical Arabic.
 * - Zero React dependencies, zero Supabase dependencies, zero network calls.
 */

export function overlayLocalizedCmsPayload<T>(
  canonicalPayload: T,
  localizedPayload: unknown,
): T {
  if (canonicalPayload === null || canonicalPayload === undefined) {
    return canonicalPayload;
  }
  if (typeof canonicalPayload === 'string') {
    if (typeof localizedPayload === 'string' && localizedPayload.trim().length > 0) {
      return localizedPayload as unknown as T;
    }
    if (typeof localizedPayload === 'object' && localizedPayload !== null && 'value' in localizedPayload) {
      const v = (localizedPayload as Record<string, unknown>).value;
      if (typeof v === 'string' && v.trim().length > 0) {
        return v as unknown as T;
      }
    }
    return canonicalPayload;
  }
  if (localizedPayload === null || localizedPayload === undefined || typeof localizedPayload !== 'object') {
    return canonicalPayload;
  }

  if (Array.isArray(canonicalPayload)) {
    const locArray = Array.isArray(localizedPayload)
      ? (localizedPayload as unknown[])
      : Object.values(localizedPayload);

    const merged = canonicalPayload.map((canonItem, index) => {
      if (canonItem === null || typeof canonItem !== 'object') {
        return canonItem;
      }

      const itemId = (canonItem as { id?: unknown }).id;
      let matchedLoc: unknown = undefined;

      if (itemId !== undefined && itemId !== null && String(itemId).trim().length > 0) {
        matchedLoc = locArray.find(
          (loc) => loc && typeof loc === 'object' && String((loc as { id?: unknown }).id) === String(itemId),
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

      return overlayLocalizedCmsPayload(canonItem, matchedLoc);
    });

    return merged as unknown as T;
  }

  if (typeof canonicalPayload === 'object') {
    const canonObj = canonicalPayload as Record<string, unknown>;
    const locObj = localizedPayload as Record<string, unknown>;
    const result: Record<string, unknown> = { ...canonObj };

    for (const [key, canonVal] of Object.entries(canonObj)) {
      const locVal = locObj[key];
      if (locVal === undefined || locVal === null) {
        continue;
      }

      if (typeof canonVal === 'string') {
        if (typeof locVal === 'string' && locVal.trim().length > 0) {
          result[key] = locVal;
        }
      } else if (Array.isArray(canonVal)) {
        if (Array.isArray(locVal)) {
          result[key] = overlayLocalizedCmsPayload(canonVal, locVal);
        }
      } else if (typeof canonVal === 'object') {
        result[key] = overlayLocalizedCmsPayload(canonVal, locVal);
      }
    }

    return result as T;
  }

  return canonicalPayload;
}
