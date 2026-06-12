import { SFNClient } from '@aws-sdk/client-sfn';

declare global {
  var _sfnClient: SFNClient | undefined;
}

function createSfnClient(): SFNClient | null {
  const region = process.env.AWS_REGION || process.env.S3_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    console.warn('[HealthChecks] AWS credentials not configured. Pipeline trigger disabled.');
    return null;
  }

  return new SFNClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export function getSfnClient(): SFNClient | null {
  if (globalThis._sfnClient === undefined) {
    globalThis._sfnClient = createSfnClient() ?? undefined;
  }
  return globalThis._sfnClient ?? null;
}
