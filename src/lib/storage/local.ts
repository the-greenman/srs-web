import { StorageError } from "./errors.js";
import type { DocumentHandle, WriteResult } from "./types.js";

export class LocalDocumentHandle implements DocumentHandle {
  readonly provider = "local" as const;
  readonly id: string;
  readonly name: string;
  readonly revision = null;
  readonly capabilities = { read: true, write: false } as const;

  constructor(private readonly file: File) {
    this.id = `${file.name}:${file.size}:${file.lastModified}`;
    this.name = file.name;
  }

  read(): Promise<string> {
    return this.file.text();
  }

  write(_content: string, _expectedRevision?: string | null): Promise<WriteResult> {
    return Promise.reject(
      new StorageError("unsupported", "Local browser files cannot be overwritten directly.")
    );
  }
}

export function downloadDocument(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadArchive(bytes: Uint8Array, filename: string): void {
  const slice = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const blob = new Blob([slice as ArrayBuffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Defer revocation so the browser's download dispatcher can fetch the blob
  // before it is released (click() is synchronous; download is not).
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
