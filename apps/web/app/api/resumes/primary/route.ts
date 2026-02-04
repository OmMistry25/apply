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

    // First, unset all primary flags for this user
    await supabase
      .from('resumes')
      .update({ is_primary: false })
      .eq('user_id', user.id);

    // Then, set the selected resume as primary
    const { error } = await supabase
      .from('resumes')
      .update({ is_primary: true })
      .eq('id', resumeId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error setting primary:', error);
      return NextResponse.json({ error: 'Failed to set primary' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Primary error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
