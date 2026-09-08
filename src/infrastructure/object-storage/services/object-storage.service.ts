import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getObjectStorageConfig } from '../config/object-storage.config';

@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageService.name);
  private client!: S3Client;
  private bucket!: string;
  private publicBaseUrl!: string;

  async onModuleInit() {
    const config = getObjectStorageConfig();
    const protocol = config.useSsl ? 'https' : 'http';
    const endpointUrl = `${protocol}://${config.endpoint}:${config.port}`;

    this.bucket = config.bucket;
    this.publicBaseUrl = config.publicBaseUrl;

    this.client = new S3Client({
      endpoint: endpointUrl,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: true,
    });

    await this.ensureBucket();
    this.logger.log(
      `Object storage ready (bucket="${this.bucket}", publicBaseUrl="${this.publicBaseUrl}")`,
    );
  }

  /**
   * Uploads a file and returns its public URL.
   */
  async uploadFile(file: Express.Multer.File): Promise<string> {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `uploads/${randomUUID()}-${safeName}`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype || 'application/octet-stream',
          ContentLength: file.size,
        }),
      );
    } catch (error) {
      this.logger.error(`MinIO upload failed for key "${key}"`, error);
      throw new InternalServerErrorException('Failed to upload file');
    }

    return this.buildPublicUrl(key);
  }

  private buildPublicUrl(key: string): string {
    const encodedKey = key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${this.publicBaseUrl}/${this.bucket}/${encodedKey}`;
  }

  private async ensureBucket() {
    let bucketExists = true;

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      bucketExists = false;
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created bucket "${this.bucket}"`);
    }

    if (!bucketExists) {
      await this.setPublicReadPolicy();
    }
  }

  private async setPublicReadPolicy() {
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${this.bucket}/*`],
        },
      ],
    };

    await this.client.send(
      new PutBucketPolicyCommand({
        Bucket: this.bucket,
        Policy: JSON.stringify(policy),
      }),
    );
  }
}
