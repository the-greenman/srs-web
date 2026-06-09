export type StorageErrorCode =
  | "cancelled"
  | "configuration"
  | "authentication"
  | "fetch"
  | "conflict"
  | "unsupported";

export class StorageError extends Error {
  constructor(
    public readonly code: StorageErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "StorageError";
  }
}

export class StorageCancelledError extends StorageError {
  constructor(message = "File selection was cancelled.") {
    super("cancelled", message);
    this.name = "StorageCancelledError";
  }
}

export class StorageConfigurationError extends StorageError {
  constructor(message: string) {
    super("configuration", message);
    this.name = "StorageConfigurationError";
  }
}

export class StorageAuthenticationError extends StorageError {
  constructor(message: string, options?: ErrorOptions) {
    super("authentication", message, options);
    this.name = "StorageAuthenticationError";
  }
}

export class StorageFetchError extends StorageError {
  constructor(message: string, options?: ErrorOptions) {
    super("fetch", message, options);
    this.name = "StorageFetchError";
  }
}

export class StorageConflictError extends StorageError {
  constructor(message = "The cloud file changed since it was opened.") {
    super("conflict", message);
    this.name = "StorageConflictError";
  }
}
