import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { resumeId } = await request.json();

    if (!resumeId) {
      return NextResponse.json({ error: 'Resume ID required' }, { status: 400 });
    }

    // MVP stub: just set parsed_json to empty object
    // In production, this would extract text and structure from the PDF
    const { error } = await supabase
      .from('resumes')
      .update({ parsed_json: {} })
      .eq('id', resumeId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Parse error:', error);
      return NextResponse.json({ error: 'Failed to parse resume' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Parse error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
