export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SuccessResponse<T> {
  success: true;
  message: string;
  data: T;
  pagination?: PaginationMeta;
}

export interface ErrorResponse {
  success: false;
  error: {
    statusCode: number;
    message: string | string[];
  };
}
