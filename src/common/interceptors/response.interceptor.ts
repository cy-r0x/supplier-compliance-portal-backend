import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { SuccessResponse } from '../interfaces/api-response.interface';

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, SuccessResponse<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponse<T>> {
    return next.handle().pipe(
      map((payload) => {
        if (this.isSuccessEnvelope(payload)) {
          return payload;
        }

        if (this.hasMessageAndData(payload)) {
          return {
            success: true,
            message: payload.message,
            data: payload.data,
          };
        }

        return {
          success: true,
          message: 'Success',
          data: payload,
        };
      }),
    );
  }

  private isSuccessEnvelope(payload: unknown): payload is SuccessResponse<T> {
    return (
      !!payload &&
      typeof payload === 'object' &&
      'success' in payload &&
      'message' in payload &&
      'data' in payload
    );
  }

  private hasMessageAndData(
    payload: unknown,
  ): payload is { message: string; data: T } {
    return (
      !!payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      'data' in payload &&
      typeof (payload as { message: unknown }).message === 'string'
    );
  }
}
