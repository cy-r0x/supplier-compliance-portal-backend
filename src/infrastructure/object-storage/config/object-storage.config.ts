export type ObjectStorageConfig = {
  endpoint: string;
  port: number;
  useSsl: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  publicBaseUrl: string;
};

export function getObjectStorageConfig(): ObjectStorageConfig {
  const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
  const port = Number(process.env.MINIO_PORT ?? '9000');
  const useSsl = process.env.MINIO_USE_SSL === 'true';
  const protocol = useSsl ? 'https' : 'http';
  const endpointUrl = `${protocol}://${endpoint}:${port}`;

  return {
    endpoint,
    port,
    useSsl,
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    bucket: process.env.MINIO_BUCKET ?? 'supplier-compliance',
    region: process.env.MINIO_REGION ?? 'us-east-1',
    publicBaseUrl: (process.env.MINIO_PUBLIC_URL ?? endpointUrl).replace(
      /\/$/,
      '',
    ),
  };
}
