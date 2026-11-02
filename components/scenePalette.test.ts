import { describe, expect, it } from 'vitest';
import { TEAM_COLORS } from '../constants';
import { reservedFor, SCENE, SHOP_SIGNS } from './scenePalette';
import { FACADES } from './corpoFacades';
import { STYLE } from './FootprintBuilding';
import { ADS } from './HoloBillboard';

describe('the reserved colours', () => {
  it('are recognised: the sides, neutral, and the nodes', () => {
    expect(reservedFor(TEAM_COLORS.blue)).toBe('Vanta red');
    // Dark reds and bright reds alike.
    expect(reservedFor('#7d2630')).toBe('Vanta red');
    expect(reservedFor('#ef4444')).toBe('Vanta red');
    expect(reservedFor(TEAM_COLORS.red)).toBe('Tokugen green');
    expect(reservedFor(TEAM_COLORS.neutral)).toBe('neutral purple');
    expect(reservedFor('#22d3ee')).toBe('server cyan');
    expect(reservedFor('#fbbf24')).toBe('core amber');
    // Dark body colours are fine.
    expect(reservedFor('#1e2838')).toBeNull();
  });
});

describe('the scenery keeps clear of them', () => {
  const check = (where: string, hex: string) => expect(reservedFor(hex), `${where} ${hex}`).toBeNull();

  it('in its palette and shop signs', () => {
    for (const [name, hex] of Object.entries(SCENE)) check(name, hex);
    SHOP_SIGNS.forEach((hex, i) => check(`shop sign ${i}`, hex));
  });

  it("in every facade's neon: accent, light strips and bands", () => {
    for (const [name, f] of Object.entries(FACADES)) {
      check(`${name} accent`, f.accent);
      if (f.strips) check(`${name} strips`, f.strips.color);
      if (f.band) check(`${name} band`, f.band.color);
    }
  });

  it("in each building type's default accent and the adverts", () => {
    for (const [kind, s] of Object.entries(STYLE)) check(kind, s.accent);
    for (const ad of ADS) { check(ad.title, ad.color); check(`${ad.title} glow`, ad.glow); }
  });
});
