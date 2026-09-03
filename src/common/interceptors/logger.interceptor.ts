import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable()
export class LoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggerInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const { method, originalUrl } = request;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = http.getResponse<Response>();
        this.logger.log(this.format(method, originalUrl, response.statusCode, startedAt));
      }),
      catchError((error: unknown) => {
        const status =
          error instanceof HttpException ? error.getStatus() : 500;
        this.logger.error(this.format(method, originalUrl, status, startedAt));
        return throwError(() => error);
      }),
    );
  }

  private format(
    method: string,
    url: string,
    status: number,
    startedAt: number,
  ): string {
    return `${method} ${url} ${status} ${Date.now() - startedAt}ms`;
  }
}
