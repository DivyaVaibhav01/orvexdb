//base path: src/error.js
export class OrvexError extends Error {
  constructor(message, code, status, data) {
    super(message);
    this.name = "OrvexError"; // Set the error name to "OrvexError"
    this.code = code ?? "UNKNOWN"; // Set the error code, defaulting to "UNKNOWN" if not provided
    this.status = status ?? 0; // Set the HTTP status code, defaulting to 0 if not provided
    this.data = data ?? null; // Set any additional data related to the error, defaulting to null if not provided
    this.retryAfter = data?.retryAfter; // Set the retryAfter property if provided in the data
  }
}