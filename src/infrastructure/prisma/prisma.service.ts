import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

const DEFAULT_CONNECT_POLLS = 3;
const POLL_INTERVAL_MS = 500;

@Injectable()
export class PrismaService
  extends PrismaClient<
    Prisma.PrismaClientOptions,
    'query' | 'info' | 'warn' | 'error'
  >
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });

    this.$on('query', (event) => {
      this.logger.debug(`${event.query} +${event.duration}ms`);
    });
    this.$on('info', (event) => this.logger.log(event.message));
    this.$on('warn', (event) => this.logger.warn(event.message));
    this.$on('error', (event) => this.logger.error(event.message));
  }

  async onModuleInit() {
    for (let attempt = 1; attempt <= DEFAULT_CONNECT_POLLS; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Database connected');
        return;
      } catch (error) {
        this.logger.warn(
          `Database connect poll ${attempt}/${DEFAULT_CONNECT_POLLS} failed`,
        );

        if (attempt === DEFAULT_CONNECT_POLLS) {
          this.logger.error(
            `Database connection failed after ${DEFAULT_CONNECT_POLLS} polls`,
          );
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }
}
