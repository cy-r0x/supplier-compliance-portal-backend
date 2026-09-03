export interface SuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: {
    statusCode: number;
    message: string | string[];
  };
}
