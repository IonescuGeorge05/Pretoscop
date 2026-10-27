import { describe, expect, it } from 'vitest';
import { detectCondition } from './condition';

describe('detectCondition from titles', () => {
  it.each([
    ['Telefon mobil Apple iPhone 15, 128GB, Pink, Resigilat', 'refurbished', 'open_box'],
    ['Televizor Samsung 55DU7172 - resigilata', 'refurbished', 'open_box'],
    ['Laptop ASUS Vivobook, Open Box', 'refurbished', 'open_box'],
    ['Televizor Samsung 65DU7172, Ambalaj deteriorat', 'refurbished', 'open_box'],
    ['Frigider Arctic, produs de expozitie', 'refurbished', 'open_box'],
    ['Telefon mobil Apple iPhone 13, 128GB, Refurbished Grad A', 'refurbished', 'grade_a'],
    ['Laptop Dell Latitude 7490, Grad B', 'refurbished', 'grade_b'],
    ['Laptop HP EliteBook, grade C', 'refurbished', 'grade_c'],
    ['iPhone 14 Pro Recondiționat', 'refurbished', undefined],
    ['Apple iPhone 12 (Renewed)', 'refurbished', 'renewed'],
    ['Samsung Galaxy S23, second hand', 'used', undefined],
    ['Telefon iPhone 12 SH', 'used', undefined],
    ['Consola PlayStation 4, folosita', 'used', undefined],
    ['Telefon mobil Apple iPhone 14 Pro, 256GB, Ca nou', 'used', undefined],
    ['Telefon Samsung utilizat', 'used', undefined],
  ])('%s → %s', (title, condition, detail) => {
    const r = detectCondition(title);
    expect(r.condition).toBe(condition);
    expect(r.detail).toBe(detail);
  });

  it('defaults to new and avoids false positives', () => {
    expect(detectCondition('Telefon mobil Samsung Galaxy S25 Ultra, 256GB')).toEqual({
      condition: 'new',
      reason: 'default',
    });
    expect(detectCondition('Aspirator vertical usor de folosit').condition).toBe('new');
    expect(detectCondition('Robot de bucatarie simplu de utilizat').condition).toBe('new');
    expect(detectCondition('Masina de spalat Clasa A').condition).toBe('new');
    expect(detectCondition('Shampoo sh 250ml').condition).toBe('new');
    expect(detectCondition('Cablu USB nesigilat').condition).toBe('new');
  });
});

describe('detectCondition from fields', () => {
  it.each([
    ['https://schema.org/NewCondition', 'new', undefined],
    ['http://schema.org/RefurbishedCondition', 'refurbished', undefined],
    ['UsedCondition', 'used', undefined],
    ['https://schema.org/DamagedCondition', 'used', 'damaged'],
    ['refurbished', 'refurbished', undefined],
    ['Resigilat', 'refurbished', 'open_box'],
    ['nou', 'new', undefined],
    ['new', 'new', undefined],
    ['used', 'used', undefined],
  ])('%s → %s', (field, condition, detail) => {
    const r = detectCondition('Telefon mobil Samsung Galaxy A56', field);
    expect(r.condition).toBe(condition);
    expect(r.detail).toBe(detail);
  });

  it('lets a non-new title win over a "new" field, and the title win between non-new signals', () => {
    expect(
      detectCondition('iPhone 13, Resigilat', 'https://schema.org/NewCondition'),
    ).toMatchObject({
      condition: 'refurbished',
      reason: 'title:resigilat',
    });
    expect(detectCondition('iPhone 13, Grad B', 'RefurbishedCondition')).toMatchObject({
      detail: 'grade_b',
      reason: 'title:grad b',
    });
    expect(detectCondition('iPhone 13', 'UsedCondition')).toMatchObject({
      condition: 'used',
      reason: 'field:UsedCondition',
    });
    expect(detectCondition('iPhone 13', 'NewCondition')).toMatchObject({
      condition: 'new',
      reason: 'field:NewCondition',
    });
  });
});
