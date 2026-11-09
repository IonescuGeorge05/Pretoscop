import { describe, expect, it } from 'vitest';
import {
  authorKeys,
  authorList,
  bookFormatOf,
  bookTitleCore,
  compareBooks,
  extractBookAttributes,
  findPublisher,
  isbnsInText,
  publisherDictionaryIssues,
  splitAuthorSuffix,
  stripIsbnMentions,
  validateIsbn,
  type BookSide,
} from './books';
import { validateGtin } from './gtin';
import { detectVertical, isBooklandGtin } from './verticals';

describe('ISBN (M29)', () => {
  it.each([
    ['9786064402332', '09786064402332'],
    ['978-606-44-0233-2', '09786064402332'],
    ['ISBN 978-606-44-0233-2', '09786064402332'],
    ['ISBN-13: 978 606 44 0233 2', '09786064402332'],
    ['0-306-40615-2', '09780306406157'],
    ['080442957X', '09780804429573'],
    ['ISBN 0-8044-2957-x', '09780804429573'],
    // 979 ranges: France (979-10), the US (979-8), ISMN for sheet music (979-0): all bookland.
    ['979-10-90636-07-1', '09791090636071'],
    ['9798654321008', '09798654321008'],
    ['979-0-001-23456-6', '09790001234566'],
  ])('%s → %s', (raw, gtin14) => {
    const r = validateIsbn(raw);
    expect(r).toMatchObject({ quality: 'valid', gtin14 });
    expect(isBooklandGtin(r.gtin14)).toBe(true);
  });

  it('reads a 10-digit code as an ISBN-10 even when its digits also pass the GS1 check', () => {
    // validateGtin alone takes it for a 12-digit UPC with two lost leading zeros.
    expect(validateGtin('9734600036')).toMatchObject({ quality: 'valid', gtin14: '00009734600036' });
    expect(validateIsbn('9734600036')).toMatchObject({ quality: 'valid', gtin14: '09789734600038', convertedFrom: 'isbn10' });
  });

  it('rejects bad check digits and non-book codes stay non-bookland', () => {
    expect(validateIsbn('978-606-44-0233-3').quality).toBe('invalid');
    expect(validateIsbn('0-306-40615-3').quality).not.toBe('valid');
    expect(isBooklandGtin(validateIsbn('5901234123457').gtin14)).toBe(false);
    expect(isBooklandGtin('09771234567003')).toBe(false); // ISSN (press) is not a book
  });

  it('finds hyphenated ISBNs in titles and strips them', () => {
    const t = 'Ion - Liviu Rebreanu, ISBN 978-973-46-1234-5 (ediția a II-a)';
    expect(isbnsInText(t).map((m) => m.gtin14)).toEqual(['09789734612345']);
    expect(stripIsbnMentions(t)).toBe('Ion - Liviu Rebreanu (ediția a II-a)');
    expect(isbnsInText('Carte cu cod 9789734612345')[0]?.gtin14).toBe('09789734612345');
    // ISBN-10 only with its label; a bare 10-digit number is not trusted.
    expect(isbnsInText('Dicționar, ISBN 0-306-40615-2').map((m) => m.gtin14)).toEqual(['09780306406157']);
    expect(isbnsInText('Telefon 0306406152')).toEqual([]);
    expect(isbnsInText('Laptop 5901234123457')).toEqual([]);
  });
});

describe('book facts', () => {
  it.each([
    ['Pisicile Războinice Vol.1: În inima pădurii - Erin Hunter', { bookVolume: 1 }],
    ['Cronicile din Narnia Vol. VI: Jilțul de argint', { bookVolume: 6 }],
    ['Legendele Olimpului. Eroii. Volumul II', { bookVolume: 2 }],
    ['Tup. Imposibil e doar un cuvânt. Cartea întâi. Ediția a III-a', { bookVolume: 1, bookEdition: 3 }],
    ['Jurnalul unui fotbalist de buzunar. Cartea a doua', { bookVolume: 2 }],
    ['Aventurile lui Dungă Cenușie. Manga Partea 3', { bookVolume: 3 }],
    ['Floare la ureche (Jurnalul unui puști #18)', { bookVolume: 18 }],
    ['Rocky. Cartea a II-a. Ediția a 2-a revizuită', { bookVolume: 2, bookEdition: 2 }],
    ['Harry Potter și Ordinul Phoenix Ed. Ilustrată - J.K. Rowling', { bookIllustrated: true }],
    ['The Hobbit, 2nd edition, paperback', { bookEdition: 2, bookFormat: 'paperback' }],
    ['Set 7 cărți Harry Potter', { bookSet: true }],
    ['Harry Potter. Box set complet', { bookSet: true }],
    ['Sapiens. Scurtă istorie a omenirii (copertă cartonată)', { bookFormat: 'hardcover' }],
    ['Atomic Habits - audiobook', { bookFormat: 'audiobook' }],
  ])('%s', (title, expected) => {
    expect(extractBookAttributes(title)).toMatchObject(expected);
  });

  it('no false volumes or editions from ordinary words', () => {
    const a = extractBookAttributes('Aventurile lui Tom Sawyer - Mark Twain');
    expect(a.bookVolume).toBeUndefined();
    const b = extractBookAttributes('Harry Potter și Ordinul Phoenix Ed. Ilustrată');
    expect(b.bookEdition).toBeUndefined();
    expect(extractBookAttributes('Tom Inima-Curată și ținutul Poveștilor Întunecate').bookVolume).toBeUndefined();
    expect(extractBookAttributes('Odiseea').bookSet).toBe(false);
  });

  it('reads structured specs: format, language, pages, a year written "2.019"', () => {
    expect(extractBookAttributes('Tup', { format: 'https://schema.org/Hardcover', language: 'ro', pages: '616', year: '2025', author: ['A. B', 'C. D'] })).toMatchObject({
      bookFormat: 'hardcover',
      bookLanguage: 'ro',
      bookPages: 616,
      bookYear: 2025,
      bookAuthors: ['A. B', 'C. D'],
    });
    expect(extractBookAttributes('Tup', { format: 'Cartonata', language: 'Romana', year: '2.019' })).toMatchObject({ bookFormat: 'hardcover', bookLanguage: 'ro', bookYear: 2019 });
    expect(extractBookAttributes('Tup', { format: 'Brosata', language: 'Engleza' })).toMatchObject({ bookFormat: 'paperback', bookLanguage: 'en' });
    expect(extractBookAttributes('Educated', {}, 'Carti in engleza > Biography').bookLanguage).toBe('en');
    expect(bookFormatOf('eBook')).toBe('ebook');
  });

  it('splits the author written after " - " (Libris style), only when it reads as a name', () => {
    expect(splitAuthorSuffix('Harry Potter si Printul Semisange - J.K. Rowling')).toEqual({ title: 'Harry Potter si Printul Semisange', author: 'J.K. Rowling' });
    expect(splitAuthorSuffix('Motanic - Arthur Lazar-Abdulvoap').author).toBe('Arthur Lazar-Abdulvoap');
    expect(splitAuthorSuffix('Cronicile din Narnia Vol.5: Calatorie cu zori de zi - C. S. Lewis').author).toBe('C. S. Lewis');
    expect(splitAuthorSuffix('Tup - Salvatoarea iernii').author).toBeNull();
    expect(splitAuthorSuffix('Război și pace - Vol. 1').author).toBeNull();
    expect(authorList('Ana Blandiana; Romulus Rusan')).toEqual(['Ana Blandiana', 'Romulus Rusan']);
    expect([...authorKeys(['J. K. Rowling', 'Rowling, J.K.'])]).toEqual(['rowling']);
  });

  it('title core drops the author, volume, edition and format words', () => {
    expect(bookTitleCore('Harry Potter și piatra filozofală. Ediție ilustrată - J.K. Rowling')).toEqual(['harry', 'potter', 'piatra', 'filozofala']);
    expect(bookTitleCore('Tup. Imposibil e doar un cuvant. Cartea intai. Editia a III-a')).toEqual(['tup', 'imposibil', 'doar', 'cuvant']);
  });
});

describe('publishers', () => {
  it('resolves spellings and imprints to one group', () => {
    expect(findPublisher('GRUPUL EDITORIAL ART')).toMatchObject({ name: 'Art', group: 'Grupul Editorial Art', known: true });
    expect(findPublisher('Editura Arthur')).toMatchObject({ name: 'Arthur', group: 'Grupul Editorial Art', known: true });
    expect(findPublisher('Curtea Veche Publishing')).toMatchObject({ name: 'Curtea Veche', known: true });
    expect(findPublisher('DIDACTICA PUBLISHING HOUSE')).toMatchObject({ name: 'Didactica Publishing House', known: true });
    expect(findPublisher('Humanitas Fiction')).toMatchObject({ name: 'Humanitas', known: true });
    expect(findPublisher('Editura Necunoscută Mică')).toMatchObject({ name: 'Editura Necunoscută Mică', known: false });
  });

  it('places and placeholders are not publishers', () => {
    expect(findPublisher('BUCURESTI')).toBeNull();
    expect(findPublisher('Diverse')).toBeNull();
    expect(findPublisher('')).toBeNull();
  });

  it('no alias points to two publishers', () => {
    expect(publisherDictionaryIssues()).toEqual([]);
  });
});

describe('compareBooks (matching rules)', () => {
  const book = (title: string, extra: Partial<BookSide> = {}, attrs: Record<string, unknown> = {}): BookSide => ({
    title,
    publisher: 'Art',
    gtin14: null,
    attributes: { kind: 'book', bookSet: false, ...attrs },
    ...extra,
  });

  it('another volume of the series is another book', () => {
    const hp1 = book('Harry Potter și piatra filozofală - J.K. Rowling', {}, { bookAuthors: ['J.K. Rowling'] });
    const hp2 = book('Harry Potter și camera secretelor - J.K. Rowling', {}, { bookAuthors: ['J.K. Rowling'] });
    expect(compareBooks(hp1, hp2).conflicts).toContain('title');
    const p1 = book('Pisicile Războinice Vol.1: În inima pădurii', {}, { bookVolume: 1 });
    const p2 = book('Pisicile Războinice Vol.2: Foc și gheață', {}, { bookVolume: 2 });
    expect(compareBooks(p1, p2).conflicts).toEqual(expect.arrayContaining(['bookVolume 1≠2', 'title']));
    const n5 = book('Cronicile din Narnia Vol.5', {}, { bookVolume: 5 });
    const n6 = book('Cronicile din Narnia Vol.6', {}, { bookVolume: 6 });
    expect(compareBooks(n5, n6).conflicts).toEqual(['bookVolume 5≠6']);
  });

  it('the same book written two ways has no conflict (diacritics, author suffix, spelling variant)', () => {
    const a = book('Harry Potter si piatra filozofala - J.K. Rowling', {}, { bookAuthors: ['J.K. Rowling'] });
    const b = book('Harry Potter și Piatra Filosofală', { publisher: 'Editura Arthur' }, { bookAuthors: ['J. K. Rowling'] });
    const r = compareBooks(a, b);
    expect(r.conflicts).toEqual([]);
    expect(r.titleSim).toBe(1);
    expect(r.authorsAgree).toBe(true);
    expect(r.publishersAgree).toBe(true);
  });

  it('ISBNs decide: equal ISBNs ignore publisher spellings, different ISBNs are different editions', () => {
    const a = book('Harry Potter si Printul Semisange', { gtin14: '09786303218656', publisher: 'GRUPUL EDITORIAL ART' });
    const b = book('Harry Potter și Prințul Semisânge. Ediție cartonată', { gtin14: '09786303218656', publisher: 'Editura Polirom' });
    expect(compareBooks(a, b)).toMatchObject({ gtinEqual: true, conflicts: [] });
    const c = book('Harry Potter si Printul Semisange', { gtin14: '09789734612345' });
    expect(compareBooks(a, c).conflicts).toContain('isbn');
    // A shop's wrong ISBN: the same code on a book with no common title word.
    const d = book('Moara cu noroc', { gtin14: '09786303218656' });
    expect(compareBooks(a, d).conflicts).toContain('title');
  });

  it('stated facts must agree: cover, language, box set, author, known publisher groups', () => {
    const hard = book('Sapiens', {}, { bookFormat: 'hardcover' });
    const soft = book('Sapiens', {}, { bookFormat: 'paperback' });
    expect(compareBooks(hard, soft).conflicts).toEqual(['bookFormat hardcover≠paperback']);
    expect(compareBooks(book('Sapiens', {}, { bookLanguage: 'ro' }), book('Sapiens', {}, { bookLanguage: 'en' })).conflicts).toEqual(['bookLanguage ro≠en']);
    expect(compareBooks(book('Harry Potter', {}, { bookSet: true }), book('Harry Potter')).conflicts).toContain('bookSet');
    expect(compareBooks(book('Odiseea', {}, { bookAuthors: ['Homer'] }), book('Odiseea', {}, { bookAuthors: ['Nikos Kazantzakis'] })).conflicts).toContain('author');
    expect(compareBooks(book('Odiseea', { publisher: 'Humanitas' }), book('Odiseea', { publisher: 'Polirom' })).conflicts).toEqual(['publisher']);
    // An unknown publisher is not evidence either way.
    expect(compareBooks(book('Odiseea', { publisher: 'Humanitas' }), book('Odiseea', { publisher: 'Editura Mică Xyz' })).conflicts).toEqual([]);
  });

  it('a shorter title (subtitle omitted) is not a hard conflict: a human decides', () => {
    const r = compareBooks(book('Spiridușa adevărului'), book('Spiridușa adevărului merge la școală'));
    expect(r.conflicts).toEqual([]);
    expect(r.titleSim).toBeLessThan(1);
  });

  it('vertical detection for books', () => {
    expect(detectVertical({ title: 'Harry Potter', gtin14: '09786303218656' })).toBe('books');
    expect(detectVertical({ title: 'Ceva', categoryRaw: 'Librarie online/Carti/Beletristica' })).toBe('books');
    expect(detectVertical({ title: 'Ceva', categoryRaw: 'Carti > Carte > Carti pentru copii' })).toBe('books');
    expect(detectVertical({ title: 'Ceva', categoryRaw: 'Romane Fantasy' })).toBe('books');
    expect(detectVertical({ title: 'Joc de societate Catan', categoryRaw: 'Jocuri > Jocuri de societate' })).toBeNull();
  });
});
