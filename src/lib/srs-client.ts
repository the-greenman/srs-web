type SrsRepoInstance = {
  validate(): string;
  list_records(filter_json: string): string;
  get_record(id: string): string | null;
  list_notes(): string;
  free(): void;
};

type SrsRepoClass = {
  load(srsj: string): SrsRepoInstance;
};

let Repo: SrsRepoClass | null = null;

export async function initWasm(): Promise<void> {
  // pkg is built from srs-rust; use a variable so TS skips static module resolution
  const pkgPath = "../../pkg/srs_bindings.js";
  const mod = (await import(/* @vite-ignore */ pkgPath)) as {
    default: () => Promise<void>;
    SrsRepository: SrsRepoClass;
  };
  await mod.default();
  Repo = mod.SrsRepository;
}

export function loadRepo(srsj: string): SrsClient {
  if (!Repo) throw new Error("WASM not initialized — call initWasm() first");
  return new SrsClient(Repo.load(srsj));
}

export class SrsClient {
  private repo: SrsRepoInstance;

  constructor(repo: SrsRepoInstance) {
    this.repo = repo;
  }

  validate(): unknown {
    return JSON.parse(this.repo.validate());
  }

  listRecords(filter: Record<string, unknown> = {}): unknown[] {
    return JSON.parse(
      this.repo.list_records(JSON.stringify(filter)),
    ) as unknown[];
  }

  getRecord(id: string): unknown | null {
    const result = this.repo.get_record(id);
    return result != null ? JSON.parse(result) : null;
  }

  listNotes(): unknown[] {
    return JSON.parse(this.repo.list_notes()) as unknown[];
  }

  free(): void {
    this.repo.free();
  }
}
