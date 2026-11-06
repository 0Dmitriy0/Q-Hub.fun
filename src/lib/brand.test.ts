import { describe, expect, it } from 'vitest';
import { FAMILY_DISCORD, familyLink, isDiscordInvite } from './brand';

describe('isDiscordInvite', () => {
  it('приймає запрошення discord.gg і discord.com/invite', () => {
    expect(isDiscordInvite('https://discord.gg/QhubCORE')).toBe(true);
    expect(isDiscordInvite('https://discord.com/invite/abc-123/')).toBe(true);
    expect(isDiscordInvite('  https://discord.gg/abc  ')).toBe(true);
  });
  it('відкидає інше', () => {
    expect(isDiscordInvite('')).toBe(false);
    expect(isDiscordInvite('http://discord.gg/abc')).toBe(false);
    expect(isDiscordInvite('https://discord.com/channels/1/2')).toBe(false);
    expect(isDiscordInvite('https://evil.example/discord.gg/x')).toBe(false);
    expect(isDiscordInvite('https://discord.gg.evil.example/abc')).toBe(false);
  });
});

describe('«by CORE» — Discord сім\'ї', () => {
  it('порожньо чи стартове запрошення 0045 — запрошення сім\'ї з коду; інше від адміна — як є', () => {
    expect(familyLink('')).toBe(FAMILY_DISCORD);
    expect(familyLink('https://discord.gg/RxUk5mGgy')).toBe(FAMILY_DISCORD);
    expect(familyLink('https://discord.gg/RxUk5mGgy/')).toBe(FAMILY_DISCORD);
    expect(familyLink('https://discord.gg/NewCore')).toBe('https://discord.gg/NewCore');
    expect(FAMILY_DISCORD).toBe('https://discord.gg/U4SZvvRueT');
  });
});
