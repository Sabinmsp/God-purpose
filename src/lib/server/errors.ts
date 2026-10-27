export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new AppError(404, what, "NOT_FOUND");
export const conflict = (message: string, code = "CONFLICT") => new AppError(409, message, code);
export const badRequest = (message: string, code = "BAD_REQUEST") => new AppError(400, message, code);
