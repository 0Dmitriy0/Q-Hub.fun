import { describe, expect, it } from 'vitest';
import { matchVehicle, type Vehicle } from './carMatch';

const v = (id: number, brand: string, name: string): Vehicle => ({ id, brand, name, price: 0, image_url: '' });
const cat = [v(1, 'Zeekr', '001'), v(2, 'BMW', 'M5 F90'), v(3, 'BMW', 'M5'), v(4, 'Übermacht', 'Sentinel')];

describe('matchVehicle', () => {
  it('точна назва, з маркою і без, без різниці в регістрі й розділювачах', () => {
    expect(matchVehicle('zeekr-001', cat)?.id).toBe(1);
    expect(matchVehicle('M5 F90', cat)?.id).toBe(2);
    expect(matchVehicle('übermacht sentinel', cat)?.id).toBe(4);
  });
  it('назва з каталогу всередині написаного — найдовша', () => {
    expect(matchVehicle('моя BMW M5 F90 чорна', cat)?.id).toBe(2);
    expect(matchVehicle('Sentinel XS', cat)?.id).toBe(4);
  });
  it('марка вже в назві каталогу — можна написати лише модель', () => {
    expect(matchVehicle('F13', [v(9, 'Übermacht', 'Übermacht F13')])?.id).toBe(9);
    expect(matchVehicle('übermacht f13', [v(9, 'Übermacht', 'Übermacht F13')])?.id).toBe(9);
  });
  it('без збігу — нічого; коротка назва не чіпляється до слів', () => {
    expect(matchVehicle('Lada', cat)).toBeNull();
    expect(matchVehicle('', cat)).toBeNull();
    expect(matchVehicle('Zeekr 0011', cat)).toBeNull();
  });
});
