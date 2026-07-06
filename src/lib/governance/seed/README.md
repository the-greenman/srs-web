# governance-seed.migrated.srsj

The empty governance document seed used by the "Create new governance document"
onboarding flow (srs-web#141). **Do not hand-edit.**

## Provenance

- **Canonical source:** `srs-rust/crates/srs-gov/assets/governance-seed.srsj`
  (the same asset `srs-gov repo-create` uses).
- **Transform applied:** `srs_repository::srsj_migration_service::migrate_rfc014`
  — moves `manifest.meta.upstreamPackage` to top-level `manifest.upstreamPackage`
  and adds `contentHash`. The canonical asset is pre-migration; the WASM
  `scaffold_new_repository` binding requires a migrated store, and WASM `load()`
  does not migrate (see the-greenman/srs-rust#381). The migration is idempotent
  and deterministic, so this artifact is reproducible byte-for-byte.

## Regeneration

From a scratch cargo project:

```toml
[package]
name = "seedgen"
version = "0.1.0"
edition = "2021"

[dependencies]
srs-repository = { path = "<srs-rust>/crates/srs-repository" }

[workspace]
```

```rust
fn main() {
    let seed = std::fs::read_to_string(
        "<srs-rust>/crates/srs-gov/assets/governance-seed.srsj").unwrap();
    let migrated =
        srs_repository::srsj_migration_service::migrate_rfc014(&seed).unwrap();
    std::fs::write("governance-seed.migrated.srsj", &migrated).unwrap();
}
```

## Planned removal

the-greenman/srs-rust#381 folds the migration into the scaffold service and
ships the seed inside `srs-bindings-web.tar.gz`; once that lands,
`npm run fetch-bindings` provides the seed and this vendored copy is deleted.
