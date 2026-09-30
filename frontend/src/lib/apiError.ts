/** Error thrown by lib/api for non-2xx responses. Lives in its own module
 * so component tests that mock "@/lib/api" can still import it. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
