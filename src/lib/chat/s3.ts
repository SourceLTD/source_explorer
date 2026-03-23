import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

declare global {
  var _s3Client: S3Client | undefined;
}

function createS3Client(): S3Client | null {
  const region = process.env.S3_REGION || process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    console.warn('[Chat] AWS credentials not configured. File upload disabled.');
    return null;
  }

  return new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export function getS3Client(): S3Client | null {
  if (globalThis._s3Client === undefined) {
    globalThis._s3Client = createS3Client() ?? undefined;
  }
  return globalThis._s3Client ?? null;
}

export async function generatePresignedUploadUrl({
  key,
  contentType,
}: {
  key: string;
  contentType: string;
}): Promise<string | null> {
  const client = getS3Client();
  const bucket = process.env.S3_BUCKET_NAME;

  if (!client || !bucket) return null;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, { expiresIn: 3600 });
}

export function getPublicUrl(key: string): string {
  const bucket = process.env.S3_BUCKET_NAME;
  const region = process.env.S3_REGION || process.env.AWS_REGION;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}
