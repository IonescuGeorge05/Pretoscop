/**
 * Publisher dictionary for books (M29): the "brand" of a book is its publisher. Shops spell
 * publishers differently ("GRUPUL EDITORIAL ART", "Editura Art", "Arthur") and name imprints
 * instead of groups, so every entry has aliases and a `group`: two books whose publishers resolve
 * to different groups are different books (a hard conflict when no ISBN decides), while two
 * imprints of one group are not a conflict. Edit freely; `books.test.ts` checks that no alias
 * points to two publishers. Prefixes "Editura", "Grupul Editorial", "Grup Editorial", "Publishing
 * House", "SRL" … are removed before lookup, so aliases are written without them.
 */

export interface PublisherSeed {
  name: string;
  aliases?: readonly string[];
  /** Publishing group the imprint belongs to (defaults to `name`). */
  group?: string;
}

export const PUBLISHER_SEEDS: readonly PublisherSeed[] = [
  // Romanian publishers (Libris and Elefant listings, 2026-11-09)
  { name: 'Art', aliases: ['grupul art', 'editorial art', 'art publishing'], group: 'Grupul Editorial Art' },
  { name: 'Arthur', group: 'Grupul Editorial Art' },
  { name: 'Youngart', aliases: ['young art'], group: 'Grupul Editorial Art' },
  { name: 'Paladin', group: 'Grupul Editorial Art' },
  { name: 'Humanitas', aliases: ['humanitas fiction', 'humanitas multimedia', 'humanitas junior'] },
  { name: 'Polirom', aliases: ['polirom junior'] },
  { name: 'Nemira', aliases: ['nemi', 'nemira junior'] },
  { name: 'Litera', aliases: ['litera junior', 'litera international'] },
  { name: 'Curtea Veche', aliases: ['curtea veche publishing'] },
  { name: 'RAO', aliases: ['rao books', 'rao international', 'rao distributie'] },
  { name: 'Trei', aliases: ['editura trei'] },
  { name: 'Corint', aliases: ['corint junior', 'corint books', 'corint educational', 'corint logistic'] },
  { name: 'Leda', group: 'Corint' },
  { name: 'Paralela 45', aliases: ['paralela45'] },
  { name: 'Niculescu' },
  { name: 'Didactica Publishing House', aliases: ['didactica', 'dph'] },
  { name: 'Didactica si Pedagogica', aliases: ['edp', 'didactica si pedagogica r a'] },
  { name: 'Booklet', aliases: ['booklet fiction'] },
  { name: 'Herg Benet' },
  { name: 'Bookzone' },
  { name: 'Publica' },
  { name: 'Seneca Lucius Annaeus', aliases: ['seneca'] },
  { name: 'Pandora M', aliases: ['pandora'] },
  { name: 'Univers' },
  { name: 'Univers Enciclopedic', aliases: ['univers enciclopedic gold', 'univers enciclopedic junior'] },
  { name: 'Cartea Romaneasca', aliases: ['cartea romaneasca educational'] },
  { name: 'Vremea' },
  { name: 'Epica' },
  { name: 'Storia Books' },
  { name: 'Lebada Neagra' },
  { name: 'Nomina' },
  { name: 'All', aliases: ['editura all', 'all educational'] },
  { name: 'Frontiera' },
  { name: 'Gama' },
  { name: 'Prut' },
  { name: 'Aramis' },
  { name: 'Meteor Press', aliases: ['meteor publishing'] },
  { name: 'Tritonic', aliases: ['tritonic books'] },
  { name: 'Crime Scene Press' },
  { name: 'Black Button Books' },
  { name: 'Bookstory' },
  { name: 'Baroque Books & Arts', aliases: ['baroque books and arts', 'baroque books'] },
  { name: 'Lifestyle Publishing', aliases: ['lifestyle'] },
  { name: 'Act si Politon' },
  { name: 'Victoria Books' },
  { name: 'Unicart' },
  { name: 'Kreativ' },
  { name: 'Editura Pentru Arta si Literatura', aliases: ['epl'] },
  { name: 'Adenium' },
  { name: 'Cartier' },
  { name: 'Hyperliteratura' },
  { name: 'Editura Univers Ilustrat', aliases: ['univers ilustrat'] },
  { name: 'Galaxia Copiilor' },
  { name: 'Sophia' },
  { name: 'Ideea Europeana', aliases: ['ideea europeana'] },
  // International publishers (books in English at Libris and Elefant)
  { name: 'Penguin', aliases: ['penguin books', 'penguin random house', 'penguin classics', 'puffin', 'vintage', 'vintage books'], group: 'Penguin Random House' },
  { name: 'HarperCollins', aliases: ['harper collins', 'harpercollins publishers', 'harper'] },
  { name: 'Bloomsbury', aliases: ['bloomsbury publishing', 'bloomsbury childrens books'] },
  { name: 'Macmillan', aliases: ['pan macmillan', 'macmillan publishers', 'picador'] },
  { name: 'Hachette', aliases: ['hachette uk', 'hodder', 'hodder stoughton', 'orion', 'little brown'] },
  { name: 'Scholastic', aliases: ['scholastic uk'] },
  { name: 'Simon & Schuster', aliases: ['simon and schuster', 'simon schuster'] },
  { name: 'Oxford University Press', aliases: ['oxford', 'oup'] },
  { name: 'Cambridge University Press', aliases: ['cambridge', 'cup'] },
  { name: 'Usborne', aliases: ['usborne publishing'] },
  { name: 'Dorling Kindersley', aliases: ['dk', 'dk publishing'] },
  { name: 'Wordsworth', aliases: ['wordsworth editions', 'wordsworth classics'] },
];

/**
 * Values shops put in the publisher field that are not publishers (places, placeholders): read as
 * "no publisher" (Libris lists "BUCURESTI" as the publisher of some books).
 */
export const NOT_PUBLISHERS: readonly string[] = [
  'bucuresti',
  'iasi',
  'cluj',
  'cluj napoca',
  'timisoara',
  'brasov',
  'chisinau',
  'romania',
  'diverse',
  'nespecificat',
  'necunoscut',
  'fara editura',
  'altele',
  'n a',
];
