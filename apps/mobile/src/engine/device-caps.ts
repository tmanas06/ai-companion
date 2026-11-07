/**
 * Device capability detection so we don't offer users models their phone can't run.
 *
 * expo-device exposes totalMemory on Android/iOS. We treat a model as "may not
 * fit" when its estimated peak RAM is within ~70% of the device's total RAM
 * (leaving headroom for the OS, the app itself, and background tasks).
 */

import * as Device from 'expo-device';
import { MODEL_CATALOG, ModelCatalogEntry } from './model-catalog';

const HEADROOM_MULTIPLIER = 1.4; // need 40% more RAM than peak estimate to be safe

export function getDeviceRamMb(): number | null {
  if (Device.totalMemory == null) return null;
  return Math.round(Device.totalMemory / 1_048_576);
}

export type ModelFit = 'ok' | 'tight' | 'too-big' | 'unknown';

export function checkModelFit(entry: ModelCatalogEntry): ModelFit {
  const ram = getDeviceRamMb();
  if (ram == null) return 'unknown';
  const required = entry.approxRamMb * HEADROOM_MULTIPLIER;
  if (ram < entry.approxRamMb) return 'too-big';
  if (ram < required) return 'tight';
  return 'ok';
}

/**
 * Returns the id of the catalog entry that best fits the device for a given kind.
 * Falls back to the smallest known model if we can't detect RAM.
 */
export function recommendModelId(
  kind: ModelCatalogEntry['kind'],
): string | null {
  const candidates = MODEL_CATALOG.filter((m) => m.kind === kind).sort(
    (a, b) => a.approxRamMb - b.approxRamMb,
  );
  if (candidates.length === 0) return null;
  const ram = getDeviceRamMb();
  if (ram == null) return candidates[0].id;
  const fits = candidates.filter((m) => m.approxRamMb * HEADROOM_MULTIPLIER <= ram);
  if (fits.length === 0) return candidates[0].id;
  // Return the largest that fits with headroom.
  return fits[fits.length - 1].id;
}
