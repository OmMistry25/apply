import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeUrl } from '@/lib/jobs/normalizeUrl';
import { detectAtsType } from '@/lib/jobs/atsDetect';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { url } = await request.json();

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

    return NextResponse.json({
      normalizedUrl,
      atsType,
    });
  } catch (error) {
    console.error('Validate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
