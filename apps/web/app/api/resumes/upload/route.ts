import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { filename, contentType, size } = await request.json();

    if (!filename || contentType !== 'application/pdf') {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    // Generate resume ID and storage path
    const resumeId = crypto.randomUUID();
    const storagePath = `${user.id}/${resumeId}.pdf`;

    // Create resume record in DB
    const { error: dbError } = await supabase
      .from('resumes')
      .insert({
        id: resumeId,
        user_id: user.id,
        storage_path: storagePath,
        filename,
        content_type: contentType,
        size_bytes: size,
        is_primary: false,
      });

    if (dbError) {
      console.error('DB error:', dbError);
      return NextResponse.json({ error: 'Failed to create resume record' }, { status: 500 });
    }

    // Generate signed upload URL using admin client
    const adminClient = createAdminClient();
    const { data: signedData, error: signError } = await adminClient.storage
      .from('resumes')
      .createSignedUploadUrl(storagePath);

    if (signError || !signedData) {
      console.error('Storage error:', signError);
      // Rollback DB insert
      await supabase.from('resumes').delete().eq('id', resumeId);
      return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
    }

    return NextResponse.json({
      uploadUrl: signedData.signedUrl,
      resumeId,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
