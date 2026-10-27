import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import sax from 'sax';
import type { FeedInput } from '../types';

/** Normalizes any feed input to an async stream of text chunks, inflating gzip when detected. */
export async function* textChunks(input: FeedInput): AsyncIterable<string> {
  if (typeof input === 'string') {
    yield input;
    return;
  }
  const source: AsyncIterable<Uint8Array | string> =
    input instanceof Uint8Array ? (async function* () { yield input; })() : input;

  const iterator = source[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) return;
  const head = first.value;
  const rest = (async function* () {
    yield head;
    for (;;) {
      const n = await iterator.next();
      if (n.done) return;
      yield n.value;
    }
  })();

  const isGzip = typeof head !== 'string' && head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b;
  const bytes: AsyncIterable<Uint8Array | string> = isGzip
    ? (Readable.from(rest).pipe(createGunzip()) as AsyncIterable<Uint8Array>)
    : rest;

  const decoder = new TextDecoder('utf-8');
  for await (const chunk of bytes) {
    yield typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
  }
  const tail = decoder.decode();
  if (tail) yield tail;
}

/** A flattened XML item: child element path → text (`g:shipping/g:price`). Repeated keys keep the first value. */
export type XmlRecord = Record<string, string>;

/**
 * Streams the XML and yields one flat record per element named in `itemTags` (case-insensitive,
 * namespace prefixes kept, e.g. `g:price`). Memory stays bounded by one item plus one chunk.
 * `onPair` lets mappers collect name/value attribute pairs (compari `<Attribute>` blocks).
 */
export async function* streamXmlItems(
  input: FeedInput,
  itemTags: string[],
): AsyncIterable<{ tag: string; record: XmlRecord; pairs: Array<[string, string]> }> {
  const wanted = new Set(itemTags.map((t) => t.toLowerCase()));
  const parser = sax.parser(true, { trim: false, normalize: false, lowercase: false, xmlns: false });
  const queue: Array<{ tag: string; record: XmlRecord; pairs: Array<[string, string]> }> = [];
  let item: { tag: string; record: XmlRecord; pairs: Array<[string, string]>; depth: number } | null = null;
  const path: string[] = [];
  let text = '';
  let pairName: string | null = null;
  let error: Error | null = null;

  parser.onopentag = (node) => {
    const name = node.name;
    if (!item && wanted.has(name.toLowerCase())) {
      item = { tag: name, record: {}, pairs: [], depth: path.length };
      for (const [k, v] of Object.entries(node.attributes)) item.record[`@${k}`] = String(v);
    }
    path.push(name);
    text = '';
  };
  parser.ontext = (t) => {
    text += t;
  };
  parser.oncdata = (t) => {
    text += t;
  };
  parser.onclosetag = (name) => {
    if (item) {
      const rel = path.slice(item.depth + 1);
      if (rel.length > 0) {
        const key = rel.join('/');
        const value = text.trim();
        if (value !== '' && item.record[key] === undefined) item.record[key] = value;
        const leaf = (rel[rel.length - 1] ?? '').toLowerCase();
        if (leaf === 'attribute_name' || leaf === 'name' && rel.length >= 2) pairName = value;
        if ((leaf === 'attribute_value' || leaf === 'value') && pairName !== null) {
          item.pairs.push([pairName, value]);
          pairName = null;
        }
      }
      if (path.length - 1 === item.depth && name === item.tag) {
        queue.push({ tag: item.tag, record: item.record, pairs: item.pairs });
        item = null;
      }
    }
    path.pop();
    text = '';
  };
  parser.onerror = (e) => {
    error = e;
  };

  for await (const chunk of textChunks(input)) {
    parser.write(chunk);
    if (error) throw error;
    while (queue.length > 0) yield queue.shift()!;
  }
  parser.close();
  if (error) throw error;
  while (queue.length > 0) yield queue.shift()!;
}
