/**
 * Normalizes a host string by removing protocol, trailing slashes, and lowercasing.
 */
export function normalizeHost(host: string): string {
  return host
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}
