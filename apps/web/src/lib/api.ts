/**
 * Case conversion utilities for API boundary.
 * Converts between snake_case (API) and camelCase (frontend).
 */

type Primitive = string | number | boolean | null | undefined;
type JSONObject = { [key: string]: JSONValue };
type JSONArray = JSONValue[];
type JSONValue = Primitive | JSONObject | JSONArray;

/**
 * Convert snake_case string to camelCase.
 */
export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert camelCase string to snake_case.
 */
export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Transform object keys from snake_case to camelCase recursively.
 * Preserves arrays, dates, and primitive values.
 */
export function keysToCamelCase<T extends JSONValue>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => keysToCamelCase(item)) as T;
  }

  if (typeof obj === 'object') {
    const result: JSONObject = {};
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = toCamelCase(key);
      result[camelKey] = keysToCamelCase(value);
    }
    return result as T;
  }

  return obj;
}

/**
 * API response wrapper with metadata.
 */
export interface ApiResponse<T> {
  data: T;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
  };
}

/**
 * API error response.
 */
export interface ApiError {
  detail: string;
  code?: string;
  fields?: Record<string, string[]>;
}

/**
 * Build URL with query parameters.
 */
export function buildUrl(base: string, path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path, base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    }
  }
  return url.toString();
}

/**
 * Parse API error from response.
 */
export async function parseApiError(response: Response) {
  try {
    const data = await response.json();
    return {
      detail: data.detail || response.statusText,
      code: data.code,
      fields: data.fields,
    };
  } catch {
    return {
      detail: response.statusText,
    };
  }
}

/**
 * Check if response is successful.
 */
export function isSuccessResponse(response: Response): boolean {
  return response.ok;
}