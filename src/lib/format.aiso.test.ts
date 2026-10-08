import { expect, it } from 'vitest';
import { aISO, aMonto } from './format';

it('aISO acepta DD/MM/AAAA y AAAA-MM-DD, rechaza fechas imposibles', () => {
  expect(aISO('01/01/2025')).toBe('2025-01-01');
  expect(aISO('30/06/2027')).toBe('2027-06-30');
  expect(aISO('1/1/2025')).toBe('2025-01-01');
  expect(aISO('2025-01-01')).toBe('2025-01-01');
  expect(aISO('31/02/2025')).toBeNull();
  expect(aISO('2025')).toBeNull();
});

it('aMonto entiende coma decimal y puntos de miles', () => {
  expect(aMonto('1500')).toBe(1500);
  expect(aMonto('1500,5')).toBe(1500.5);
  expect(aMonto('1.500')).toBe(1500);
  expect(aMonto('1.500.000,25')).toBe(1500000.25);
  expect(aMonto('$ 1500.5')).toBe(1500.5);
  expect(aMonto('')).toBeNaN();
  expect(aMonto('abc')).toBeNaN();
});
