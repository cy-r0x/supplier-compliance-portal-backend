import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './infrastructure/auth/auth.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggerInterceptor } from './common/interceptors/logger.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProductsModule } from './modules/products/products.module';
import { PublicModule } from './modules/public/public.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    NotificationsModule,
    PublicModule,
    SettingsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggerInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
