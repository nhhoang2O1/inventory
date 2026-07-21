import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const responseBody = exception instanceof HttpException ? exception.getResponse() : null;

    let detail = 'An unexpected internal server error occurred.';
    let title = 'Internal Server Error';

    if (typeof responseBody === 'string') {
      detail = responseBody;
    } else if (responseBody && typeof responseBody === 'object') {
      detail = (responseBody as any).message || (responseBody as any).error || detail;
      title = (responseBody as any).error || title;
    } else if (exception instanceof Error) {
      detail = exception.message;
    }

    const problemDetails = {
      type: `https://httpstatuses.com/${status}`,
      title,
      status,
      detail: Array.isArray(detail) ? detail.join(', ') : detail,
      instance: request.url,
      correlationId: request.correlationId || null,
      timestamp: new Date().toISOString()
    };

    response.status(status).json(problemDetails);
  }
}
