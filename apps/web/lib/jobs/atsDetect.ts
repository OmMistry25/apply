export type AtsType = 'greenhouse' | 'lever' | 'workday' | 'unknown';

export function detectAtsType(url: string): AtsType {
  try {
    const parsed = new URL(url);
    const host = parsed.host.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    // Greenhouse: boards.greenhouse.io or jobs.greenhouse.io
    if (host.includes('greenhouse.io')) {
      return 'greenhouse';
    }

    // Lever: jobs.lever.co or *.lever.co
    if (host.includes('lever.co')) {
      return 'lever';
    }

    // Workday: *.myworkdayjobs.com or *.wd*.myworkdayjobs.com
    if (host.includes('myworkdayjobs.com') || host.includes('workday.com')) {
      return 'workday';
    }

    // Check path patterns for embedded ATS
    if (path.includes('/greenhouse/') || path.includes('/gh/')) {
      return 'greenhouse';
    }

    if (path.includes('/lever/')) {
      return 'lever';
    }

    if (path.includes('/workday/') || path.includes('/wd/')) {
      return 'workday';
    }

    return 'unknown';
  } catch {
    return 'unknown';
  }
}
