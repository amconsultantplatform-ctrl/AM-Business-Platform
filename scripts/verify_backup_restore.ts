import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PilotDatabaseService } from '../server/pilotDatabase';

const databasePath = path.resolve('data/backup-restore-verification.db');
for (const file of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
  fs.rmSync(file, { force: true });
}

process.env.DATABASE_PATH = databasePath;
const database = PilotDatabaseService.getInstance();
database.upsertEntity('backup_probe', {
  id: 'backup-probe-1',
  tenantId: 'ten-001',
  companyId: 'comp-001',
  value: 'durable'
});

const backup = database.createBackup('closure-backup');
assert.equal(backup.metadata.totalRecords, 1);
database.upsertEntity('backup_probe', {
  id: 'backup-probe-2',
  tenantId: 'ten-001',
  companyId: 'comp-001',
  value: 'to-be-replaced'
});

const restored = database.restoreBackup(backup);
assert.equal(restored.totalRecordsRestored, 1);
assert.ok(database.getEntity<any>('backup_probe', 'backup-probe-1'));
assert.equal(database.getEntity<any>('backup_probe', 'backup-probe-2'), null);

const tampered = structuredClone(backup);
tampered.data.backup_probe[0].value = 'tampered';
assert.throws(() => database.restoreBackup(tampered), /Checksum integrity mismatch/);
assert.equal(database.getEntity<any>('backup_probe', 'backup-probe-1')?.value, 'durable');

console.log('BACKUP_RESTORE_CERTIFICATION: PASS');
