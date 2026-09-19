import { ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';

export async function findAvailablePort(preferred?: string | number): Promise<number> {
  if (preferred !== undefined) {
    const port = Number(preferred);
    if (Number.isInteger(port) && port > 0 && port < 65536) return port;
  }
  return await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        probe.close();
        reject(new Error('Unable to determine an available test port'));
        return;
      }
      probe.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

export async function removeDatabaseFiles(databasePath: string): Promise<void> {
  await Promise.all([
    fs.rm(databasePath, { force: true }),
    fs.rm(`${databasePath}-wal`, { force: true }),
    fs.rm(`${databasePath}-shm`, { force: true })
  ]);
}

export async function stopTestServer(server: ChildProcess | undefined): Promise<void> {
  if (!server?.pid) return;
  await new Promise<void>(resolve => {
    const finish = () => resolve();
    server.once('exit', finish);
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      try { server.kill('SIGTERM'); } catch { finish(); }
    }
    const timeout = setTimeout(() => {
      try { process.kill(-server.pid!, 'SIGKILL'); } catch {}
      finish();
    }, 2_000);
    server.once('exit', () => clearTimeout(timeout));
  });
}
