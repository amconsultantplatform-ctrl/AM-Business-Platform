import { PilotDatabaseService } from './pilotDatabase';

type CollectionState = Record<string, any[]>;
type WriteSetEntry = { collection: string; type: 'upsert' | 'delete'; entity?: any; id?: string };

/**
 * Runs a manufacturing operation against detached state and persists only the
 * actual writes that the successful business operation produced. This prevents
 * stale collection snapshots from overwriting a newer durable winner while still
 * guaranteeing atomic commit and post-commit publication.
 */
export class ManufacturingTransactionCoordinator {
  constructor(private readonly pilotDb: PilotDatabaseService) {}

  private cloneCollections(collections: CollectionState): CollectionState {
    return Object.fromEntries(
      Object.entries(collections).map(([name, value]) => [name, JSON.parse(JSON.stringify(value))])
    );
  }

  private entityKey(collection: string, entity: any): string {
    if (!entity || typeof entity !== 'object') {
      return `${collection}:__value__`;
    }
    return String(entity.id ?? entity.code ?? entity.sku ?? entity.number ?? `${collection}:${Math.random().toString(36).slice(2)}`);
  }

  private isEquivalent(a: any, b: any): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  private buildWriteSet(original: CollectionState, staged: CollectionState): WriteSetEntry[] {
    const writes: WriteSetEntry[] = [];
    for (const [collection, originalItems] of Object.entries(original)) {
      const stagedItems = staged[collection] ?? [];
      const originalById = new Map((originalItems ?? []).map((item) => [this.entityKey(collection, item), item]));
      const stagedById = new Map((stagedItems ?? []).map((item) => [this.entityKey(collection, item), item]));

      for (const [id, originalEntity] of originalById.entries()) {
        if (!stagedById.has(id)) {
          writes.push({ collection, type: 'delete', id });
        }
      }

      for (const [id, stagedEntity] of stagedById.entries()) {
        const originalEntity = originalById.get(id);
        if (!originalEntity || !this.isEquivalent(originalEntity, stagedEntity)) {
          writes.push({ collection, type: 'upsert', entity: stagedEntity, id });
        }
      }
    }

    return writes;
  }

  private assertNoConcurrentOverwrite(collection: string, entity: any): void {
    if (!entity || typeof entity !== 'object' || !entity.id) {
      return;
    }
    const current = this.pilotDb.getEntity(collection, entity.id);
    if (!current) {
      return;
    }

    const currentVersion = Number((current as any).version ?? (current as any).updatedVersion ?? 0);
    const stagedVersion = Number((entity as any).version ?? (entity as any).updatedVersion ?? 0);
    if (Number.isFinite(currentVersion) && Number.isFinite(stagedVersion)) {
      if (currentVersion > stagedVersion) {
        throw new Error(`Concurrent modification detected while writing ${collection}:${entity.id}`);
      }
      return;
    }

    if (this.isEquivalent(current, entity)) {
      return;
    }
    throw new Error(`Concurrent modification detected while writing ${collection}:${entity.id}`);
  }

  private persistWriteSet(writes: WriteSetEntry[]): void {
    for (const entry of writes) {
      if (entry.type === 'delete') {
        if (entry.id) {
          this.pilotDb.deleteEntity(entry.collection, entry.id);
        }
        continue;
      }
      if (!entry.entity) continue;
      this.assertNoConcurrentOverwrite(entry.collection, entry.entity);
      this.pilotDb.saveEntity(entry.collection, entry.entity);
    }
  }

  execute<T>(
    collections: CollectionState,
    work: (staged: CollectionState) => T
  ): T {
    const original = this.cloneCollections(collections);
    let staged: CollectionState | undefined;
    let writes: WriteSetEntry[] = [];

    const result = this.pilotDb.transaction(() => {
      staged = this.cloneCollections(original);
      const value = work(staged);
      writes = this.buildWriteSet(original, staged);
      this.persistWriteSet(writes);
      return value;
    });

    if (!staged) {
      return result;
    }

    const publishedCollections = new Set<string>();
    for (const write of writes) {
      publishedCollections.add(write.collection);
    }

    for (const [name, target] of Object.entries(collections)) {
      if (!publishedCollections.has(name)) {
        continue;
      }
      target.splice(0, target.length, ...(staged[name] ?? []));
    }

    return result;
  }
}
