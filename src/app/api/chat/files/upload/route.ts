import { getCurrentUser } from '@/utils/supabase/server';
import { ChatError } from '@/lib/chat/errors';
import { getS3Client, getPublicUrl } from '@/lib/chat/s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { generateUUID } from '@/lib/chat/utils';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png']);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return new ChatError('unauthorized:chat').toResponse();
  }

  const s3 = getS3Client();
  const bucket = process.env.S3_BUCKET_NAME;

  if (!s3 || !bucket) {
    return Response.json(
      { error: 'File upload is not configured' },
      { status: 503 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return Response.json(
        { error: 'Only JPEG and PNG images are allowed' },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return Response.json(
        { error: 'File size must be under 5MB' },
        { status: 400 },
      );
    }

    const ext = file.type === 'image/png' ? 'png' : 'jpg';
    const key = `chat-uploads/${user.id}/${generateUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      }),
    );

    return Response.json({
      url: getPublicUrl(key),
      name: file.name,
      contentType: file.type,
    });
  } catch (error) {
    console.error('File upload error:', error);
    return Response.json({ error: 'Upload failed' }, { status: 500 });
  }
}
