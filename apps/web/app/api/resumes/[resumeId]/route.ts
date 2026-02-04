import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ resumeId: string }> }
) {
  try {
    const { resumeId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get resume to find storage path
    const { data: resume, error: fetchError } = await supabase
      .from('resumes')
      .select('storage_path')
      .eq('id', resumeId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !resume) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
    }

    // Delete from storage using admin client
    const adminClient = createAdminClient();
    await adminClient.storage.from('resumes').remove([resume.storage_path]);

    // Delete from DB
    const { error: deleteError } = await supabase
      .from('resumes')
      .delete()
      .eq('id', resumeId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete resume' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
