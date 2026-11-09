import { describe, expect, it } from 'vitest';
import { beautyDictionaryIssues, compareBeauty, detectBeautyBrand, extractBeautyAttributes, findBeautyBrand, type BeautySide } from './beauty';
import { detectBrand } from './brands';
import { detectVertical, isBeautyTitle } from './verticals';

describe('beauty vertical detection (M29)', () => {
  it.each([
    'Apă de toaletă Dior Sauvage, 100 ml, pentru bărbați',
    'Dior Sauvage Eau de Toilette pentru bărbați 100 ml',
    'Parfum Chanel Coco Mademoiselle EDP 50ml',
    'Hugo Boss Bottled EDT 100ml',
    'Ruj Maybelline SuperStay Matte Ink, nuanța 20',
    'Fond de ten Estée Lauder Double Wear 30 ml',
    'Șampon Head & Shoulders Classic Clean 400 ml',
    'Cremă de față Nivea Q10 50 ml',
    'Set cadou Rabanne 1 Million: Apă de toaletă 100 ml + Deodorant 150 ml',
  ])('%s → beauty', (title) => {
    expect(detectVertical({ title })).toBe('beauty');
  });

  it.each([
    ['Uscător de păr Philips BHD300/10, 1600 W', null],
    ['Aparat de ras electric Braun Series 9', null],
    ['Iluminator LED pentru birou', null],
    ['Televizor Samsung 55" Crystal UHD', null],
    ['Periuță de dinți electrică Oral-B iO 3', 'Îngrijire personală > Periuțe de dinți electrice'],
    ['Placa de par Remington', 'Ingrijire personala > Aparate de coafat'],
  ])('%s → not beauty (personal care appliances stay electronics)', (title, crumb) => {
    expect(detectVertical({ title, categoryRaw: crumb })).toBeNull();
    expect(isBeautyTitle(title)).toBe(false);
  });

  it('breadcrumbs name the vertical', () => {
    expect(detectVertical({ title: 'Sauvage', categoryRaw: 'Parfumuri > Parfumuri bărbați' })).toBe('beauty');
    expect(detectVertical({ title: 'Ceva', categoryRaw: 'Cosmetice > Machiaj > Buze' })).toBe('beauty');
    expect(detectVertical({ title: 'Ceva', categoryRaw: 'Dermatocosmetice > Îngrijirea tenului' })).toBe('beauty');
  });
});

describe('beauty brands', () => {
  it('resolves aliases, lines and start-only brands', () => {
    expect(findBeautyBrand('Christian Dior')).toBe('Dior');
    expect(findBeautyBrand('YSL')).toBe('Yves Saint Laurent');
    expect(findBeautyBrand("L'OREAL PARIS")).toBe("L'Oréal Paris");
    expect(detectBeautyBrand('Sauvage Eau de Parfum 100 ml')).toEqual({ name: 'Dior', via: 'line' });
    expect(detectBeautyBrand('Apa de toaleta Christian Dior Sauvage 60 ml')).toEqual({ name: 'Dior', via: 'title' });
    expect(detectBeautyBrand('MAC Ruby Woo ruj')).toEqual({ name: 'MAC', via: 'title' });
    expect(detectBeautyBrand('Ruj mat cu mac de vanilie')).toBeNull();
    expect(detectBeautyBrand('Jaguar Classic Black EDT 100ml')).toEqual({ name: 'Jaguar', via: 'title' });
    expect(detectBeautyBrand('Apa de toaleta', 'Paco Rabanne')).toEqual({ name: 'Rabanne', via: 'field' });
  });

  it('the beauty dictionary never changes an electronics brand (it is not part of the launch dictionary)', () => {
    expect(detectBrand('Volan Thrustmaster Ferrari 458 Spider pentru Xbox')?.name).toBe('Thrustmaster');
  });

  it('no alias or line points to two brands', () => {
    expect(beautyDictionaryIssues()).toEqual([]);
  });
});

describe('beauty attributes', () => {
  it.each([
    ['Apă de toaletă Dior Sauvage, 100 ml, pentru bărbați', { kind: 'fragrance', volumeMl: 100, concentration: 'edt', gender: 'male', giftSet: false, tester: false, refill: false }],
    ['Dior Sauvage EDP 60ml', { volumeMl: 60, concentration: 'edp' }],
    ['Dior Sauvage Parfum 100 ml', { concentration: 'parfum' }],
    ['Parfum Dior Sauvage, Apa de toaleta 100ml', { concentration: 'edt' }],
    ['Chanel No 5 Eau de Parfum 3,5 ml mini', { volumeMl: 3.5, concentration: 'edp' }],
    ['Lancôme La Vie Est Belle EDP 100ml TESTER', { tester: true }],
    ['Set cadou Rabanne 1 Million: Apă de toaletă 100 ml + Deodorant 150 ml', { giftSet: true, volumeMl: 100 }],
    ['Mugler Alien EDP 60 ml Refill', { refill: true }],
    ['Ruj Maybelline SuperStay Matte Ink, nuanța 20', { kind: 'cosmetics', shade: '20' }],
    ['Fond de ten Estée Lauder Double Wear 1W2 Sand 30 ml', { volumeMl: 30 }],
    ['Cremă de față Nivea Q10 50 ml pentru femei', { volumeMl: 50, gender: 'female' }],
    ['Pudră compactă Rimmel Stay Matte 14 g #001', { weightG: 14, shade: '001' }],
    ['CK One Eau de Toilette unisex 200 ml', { gender: 'unisex' }],
  ])('%s', (title, expected) => {
    expect(extractBeautyAttributes(title)).toMatchObject(expected);
  });

  it('no shade on fragrances ("No 5" is a name)', () => {
    expect(extractBeautyAttributes('Chanel No 5 Eau de Parfum 100 ml').shade).toBeUndefined();
  });
});

describe('compareBeauty (matching rules)', () => {
  const side = (title: string, brand = 'Dior'): BeautySide => ({ title, brand, attributes: { ...extractBeautyAttributes(title) } });

  it('sizes, concentrations, testers, gift sets and refills are different products', () => {
    const a = side('Dior Sauvage EDT 100 ml');
    expect(compareBeauty(a, side('Dior Sauvage EDT 60 ml'), { identifierEqual: false }).conflicts).toContain('volumeMl 100≠60');
    expect(compareBeauty(a, side('Dior Sauvage EDP 100 ml'), { identifierEqual: false }).conflicts).toContain('concentration edt≠edp');
    expect(compareBeauty(a, side('Dior Sauvage EDT 100 ml Tester'), { identifierEqual: false }).conflicts).toContain('tester');
    expect(compareBeauty(a, side('Set cadou Dior Sauvage EDT 100 ml + gel de duș 50 ml'), { identifierEqual: false }).conflicts).toContain('giftSet');
    expect(compareBeauty(side('Mugler Alien EDP 60 ml', 'Mugler'), side('Mugler Alien EDP 60 ml Refill', 'Mugler'), { identifierEqual: false }).conflicts).toContain('refill');
    expect(compareBeauty(side('Ruj MAC Matte nuanța 602', 'MAC'), side('Ruj MAC Matte nuanța 646', 'MAC'), { identifierEqual: false }).conflicts).toContain('shade 602≠646');
  });

  it('flankers of one line are other products; the same product written two ways is not', () => {
    expect(compareBeauty(side('Dior Sauvage EDP 60 ml'), side('Dior Sauvage Elixir 60 ml'), { identifierEqual: false }).conflicts).toEqual(expect.arrayContaining(['flanker elixir']));
    const r = compareBeauty(side('Apă de parfum Dior Sauvage, 60 ml, pentru bărbați'), side('Christian Dior Sauvage Eau de Parfum 60ml'), { identifierEqual: false });
    expect(r.conflicts).toEqual([]);
    expect(r.titleSim).toBe(1);
  });

  it('with an identifier only stated facts count (marketing words never break a GTIN match)', () => {
    const r = compareBeauty(side('Dior Sauvage EDT 100 ml Intense Fresh'), side('Dior Sauvage EDT 100 ml'), { identifierEqual: true });
    expect(r.conflicts).toEqual([]);
  });
});
