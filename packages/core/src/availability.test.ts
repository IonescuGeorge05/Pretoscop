import { describe, expect, it } from 'vitest';
import { mapAvailability } from './availability';

describe('mapAvailability', () => {
  it.each([
    ['https://schema.org/InStock', 'in_stock'],
    ['http://schema.org/InStock', 'in_stock'],
    ['InStock', 'in_stock'],
    ['in_stock', 'in_stock'],
    ['https://schema.org/LimitedAvailability', 'in_stock'],
    ['OnlineOnly', 'in_stock'],
    ['https://schema.org/OutOfStock', 'out_of_stock'],
    ['out of stock', 'out_of_stock'],
    ['Discontinued', 'out_of_stock'],
    ['SoldOut', 'out_of_stock'],
    ['https://schema.org/PreOrder', 'preorder'],
    ['BackOrder', 'preorder'],
    ['PreSale', 'preorder'],
    ['MadeToOrder', 'preorder'],
    ['InStoreOnly', 'unknown'],
  ])('schema.org %s → %s', (raw, expected) => {
    expect(mapAvailability(raw)).toBe(expected);
  });

  it.each([
    ['În stoc', 'in_stock'],
    ['in stoc', 'in_stock'],
    ['Stoc limitat', 'in_stock'],
    ['Ultimele bucăți', 'in_stock'],
    ['Ultimele 2 produse', 'in_stock'],
    ['Disponibil', 'in_stock'],
    ['Produs disponibil', 'in_stock'],
    ['În stoc furnizor', 'in_stock'],
    ['Stoc epuizat', 'out_of_stock'],
    ['Indisponibil', 'out_of_stock'],
    ['Nu este în stoc', 'out_of_stock'],
    ['Momentan indisponibil', 'out_of_stock'],
    ['Nu mai este disponibil', 'out_of_stock'],
    ['Precomandă', 'preorder'],
    ['În curând', 'preorder'],
    ['Disponibil în curând', 'preorder'],
    ['La comandă', 'preorder'],
    ['Disponibil la comandă', 'preorder'],
    ['Livrare in 24h', 'unknown'],
  ])('Romanian %s → %s', (raw, expected) => {
    expect(mapAvailability(raw)).toBe(expected);
  });

  it('maps feed flags, booleans and stock counts', () => {
    expect(mapAvailability('1')).toBe('in_stock');
    expect(mapAvailability('0')).toBe('out_of_stock');
    expect(mapAvailability('yes')).toBe('in_stock');
    expect(mapAvailability('No')).toBe('out_of_stock');
    expect(mapAvailability('da')).toBe('in_stock');
    expect(mapAvailability('nu')).toBe('out_of_stock');
    expect(mapAvailability('true')).toBe('in_stock');
    expect(mapAvailability('FALSE')).toBe('out_of_stock');
    expect(mapAvailability(true)).toBe('in_stock');
    expect(mapAvailability(false)).toBe('out_of_stock');
    expect(mapAvailability(12)).toBe('in_stock');
    expect(mapAvailability(0)).toBe('out_of_stock');
    expect(mapAvailability('7')).toBe('in_stock');
  });

  it('returns unknown for empty or unrecognized values', () => {
    expect(mapAvailability(undefined)).toBe('unknown');
    expect(mapAvailability(null)).toBe('unknown');
    expect(mapAvailability('')).toBe('unknown');
    expect(mapAvailability('xyz')).toBe('unknown');
    expect(mapAvailability({})).toBe('unknown');
    expect(mapAvailability(Number.NaN)).toBe('unknown');
  });
});
