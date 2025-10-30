export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export class RateLimitError extends APIError {
  constructor(retryAfter: number = 60) {
    super('Rate limit exceeded', 429, 'RATE_LIMIT', retryAfter);
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends APIError {
  constructor(message: string = 'Network request failed') {
    super(message, 0, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

export class ValidationError extends APIError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export function handleAPIError(error: any): APIError {
  if (error instanceof APIError) return error;
  
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new NetworkError('Request timeout');
  }
  
  if (error.response) {
    const status = error.response.status;
    const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
    
    if (status === 429) {
      return new RateLimitError(retryAfter);
    }
    
    if (status === 404) {
      return new APIError('Resource not found', 404, 'NOT_FOUND');
    }
    
    if (status >= 500) {
      return new APIError('Server error', status, 'SERVER_ERROR');
    }
    
    return new APIError(error.response.data?.error || 'Request failed', status);
  }
  
  if (error.request) {
    return new NetworkError('No response from server');
  }
  
  return new APIError(error.message || 'Unknown error');
}