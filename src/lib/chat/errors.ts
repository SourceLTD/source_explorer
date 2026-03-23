export type ErrorType =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limit'
  | 'offline';

export type Surface = 'chat' | 'database' | 'api' | 'stream';

export type ErrorCode = `${ErrorType}:${Surface}`;

export type ErrorVisibility = 'response' | 'log';

const visibilityBySurface: Record<Surface, ErrorVisibility> = {
  database: 'log',
  chat: 'response',
  api: 'response',
  stream: 'response',
};

function getStatusCode(type: ErrorType): number {
  switch (type) {
    case 'bad_request': return 400;
    case 'unauthorized': return 401;
    case 'forbidden': return 403;
    case 'not_found': return 404;
    case 'rate_limit': return 429;
    case 'offline': return 503;
    default: return 500;
  }
}

function getDefaultMessage(code: ErrorCode): string {
  if (code.includes('database')) {
    return 'An error occurred while executing a database query.';
  }
  switch (code) {
    case 'bad_request:api':
      return 'The request could not be processed. Please check your input.';
    case 'unauthorized:chat':
      return 'You need to sign in to use chat.';
    case 'forbidden:chat':
      return 'This chat belongs to another user.';
    case 'not_found:chat':
      return 'The requested chat was not found.';
    case 'rate_limit:chat':
      return 'Too many messages. Please wait before sending another.';
    case 'offline:chat':
      return 'We are having trouble sending your message. Please try again.';
    default:
      return 'Something went wrong. Please try again later.';
  }
}

export class ChatError extends Error {
  type: ErrorType;
  surface: Surface;
  statusCode: number;

  constructor(errorCode: ErrorCode, cause?: string) {
    super();
    const [type, surface] = errorCode.split(':') as [ErrorType, Surface];
    this.type = type;
    this.surface = surface;
    this.cause = cause;
    this.message = getDefaultMessage(errorCode);
    this.statusCode = getStatusCode(type);
  }

  toResponse() {
    const code: ErrorCode = `${this.type}:${this.surface}`;
    const visibility = visibilityBySurface[this.surface];

    if (visibility === 'log') {
      console.error({ code, message: this.message, cause: this.cause });
      return Response.json(
        { code: '', message: 'Something went wrong. Please try again later.' },
        { status: this.statusCode },
      );
    }

    return Response.json(
      { code, message: this.message, cause: this.cause },
      { status: this.statusCode },
    );
  }
}
