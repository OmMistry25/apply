// Tracking parameters to strip from URLs
const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'referer',
  'source',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
];

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Lowercase protocol and host
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.host = parsed.host.toLowerCase();

    // Remove tracking parameters
    TRACKING_PARAMS.forEach((param) => {
      parsed.searchParams.delete(param);
    });

    // Remove trailing slash from pathname (unless it's just "/")
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    // Remove hash/fragment
    parsed.hash = '';

    return parsed.toString();
  } catch {
    // If URL parsing fails, return as-is
    return url;
  }
}
