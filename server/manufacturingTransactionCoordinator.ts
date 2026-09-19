import { PilotDatabaseService } from './pilotDatabase';

type CollectionState = Record<string, any[]>;

/**
 * Runs a manufacturing operation against detached state and publishes it only
 * after the durable transaction commits. A failed operation therefore has no
 * in-memory mutations to undo.
 */
export class ManufacturingTransactionCoordinator {
  constructor(private readonly pilotDb: PilotDatabaseService) {}

  execute<T>(
    collections: CollectionState,
    work: (staged: CollectionState) => T
  ): T {
    const staged: CollectionState = Object.fromEntries(
      Object.entries(collections).map(([name, value]) => [name, JSON.parse(JSON.stringify(value))])
    );
    const result = this.pilotDb.transaction(() => {
      const value = work(staged);
      for (const [collection, entities] of Object.entries(staged)) {
        for (const entity of entities) {
          this.pilotDb.saveEntity(collection, entity);
        }
      }
      return value;
    });

    // Publishing is deliberately after COMMIT: no rollback callback or state
    // restoration is needed when downstream work fails.
    for (const [name, target] of Object.entries(collections)) {
      target.splice(0, target.length, ...staged[name]);
    }
    return result;
  }
}
