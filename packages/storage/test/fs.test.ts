import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import { FsBlobStore } from '../src/index';

const root = mkdtempSync(join(tmpdir(), 'pretoscop-blob-'));
const store = new FsBlobStore(root);
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('FsBlobStore', () => {
  it('puts, gets, lists and deletes', async () => {
    await store.put('snapshots/emag/1/10.jsonl.gz', 'abc');
    await store.putStream('snapshots/emag/1/11.jsonl.gz', Readable.from(['de', 'f']));
    expect(Buffer.from((await store.get('snapshots/emag/1/10.jsonl.gz'))!).toString()).toBe('abc');
    expect((await store.list('snapshots/emag/')).map((o) => o.key)).toEqual([
      'snapshots/emag/1/10.jsonl.gz',
      'snapshots/emag/1/11.jsonl.gz',
    ]);
    await store.delete('snapshots/emag/1/10.jsonl.gz');
    expect(await store.exists('snapshots/emag/1/10.jsonl.gz')).toBe(false);
    expect(await store.get('missing')).toBeNull();
  });

  it('refuses keys that escape the root', async () => {
    await expect(store.put('../x', 'a')).rejects.toThrow(/invalid blob key/);
    await expect(store.put('/abs', 'a')).rejects.toThrow(/invalid blob key/);
  });
});
