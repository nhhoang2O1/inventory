import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from '@nestjs/common';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<{ status(code: number): { json(body: unknown): void } }>();
    const request = context.getRequest<{ url?: string; correlationId?: string }>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : undefined;
    const detail = typeof raw === 'string'
      ? raw
      : typeof raw === 'object' && raw && 'message' in raw
        ? (raw as { message?: unknown }).message
        : 'Unexpected internal error';
    const safeDetail = status >= 500 ? 'Unexpected internal error' : detail;
    response.status(status).json({
      type: 'https://wms.local/problems/http-error',
      title: HttpStatus[status] || 'HTTP error',
      status,
      detail: safeDetail,
      instance: request.url,
      correlationId: request.correlationId,
      timestamp: new Date().toISOString()
    });
  }
}
