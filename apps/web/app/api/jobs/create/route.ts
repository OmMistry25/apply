import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeUrl } from '@/lib/jobs/normalizeUrl';
import { detectAtsType } from '@/lib/jobs/atsDetect';

function extractCompanyFromUrl(url: string, atsType: string): string | null {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);

    // Lever: jobs.lever.co/{company}/...
    if (atsType === 'lever' && parsed.host.includes('lever.co') && pathParts.length > 0) {
      return formatCompanyName(pathParts[0]);
    }

    // Greenhouse: boards.greenhouse.io/{company}/... or job-boards.greenhouse.io/{company}/...
    if (atsType === 'greenhouse' && parsed.host.includes('greenhouse.io') && pathParts.length > 0) {
      return formatCompanyName(pathParts[0]);
    }

    // Workday: {company}.wd{n}.myworkdayjobs.com/...
    if (atsType === 'workday') {
      const hostParts = parsed.host.split('.');
      if (hostParts.length > 0) {
        return formatCompanyName(hostParts[0]);
      }
    }

    return null;
  } catch {
    return null;
  }
}

function formatCompanyName(slug: string): string {
  // Convert slug to readable name: "my-company" -> "My Company"
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { url, companyName, jobTitle } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const normalizedUrl = normalizeUrl(url);
    const atsType = detectAtsType(url);
    const extractedCompany = extractCompanyFromUrl(url, atsType);

    // Insert job target
    const { data, error } = await supabase
      .from('job_targets')
      .insert({
        user_id: user.id,
        url,
        normalized_url: normalizedUrl,
        ats_type: atsType,
        company_name: companyName || extractedCompany || null,
        job_title: jobTitle || null,
        status: 'new',
      })
      .select()
      .single();

    if (error) {
      // Check for duplicate
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Job already exists' }, { status: 409 });
      }
      console.error('Create job error:', error);
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
    }

    return NextResponse.json({ job: data });
  } catch (error) {
    console.error('Create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
