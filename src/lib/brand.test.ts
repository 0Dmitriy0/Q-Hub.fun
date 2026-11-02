import { describe, expect, it } from 'vitest';
import { DISCORD_DEFAULTS, isDiscordInvite, pickLink } from './brand';

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

describe('три Discord у підвалі', () => {
  it('немає колонки — запасне з коду; є запрошення — з бази; порожньо чи не запрошення — сховати', () => {
    expect(pickLink(undefined, DISCORD_DEFAULTS.market)).toBe('https://discord.gg/KcCRVzpVAR');
    expect(pickLink(' https://discord.gg/abcDEF12 ', DISCORD_DEFAULTS.market)).toBe('https://discord.gg/abcDEF12');
    expect(pickLink('', DISCORD_DEFAULTS.market)).toBe('');
    expect(pickLink('https://evil.example/discord', DISCORD_DEFAULTS.market)).toBe('');
    expect(pickLink('https://discord.gg/RxUk5mGgy', DISCORD_DEFAULTS.site)).toBe('https://discord.gg/RMHEtGC8gJ');   // старе стартове — нове
  });
  it('запасні запрошення — справжні безстрокові посилання', () => {
    for (const u of Object.values(DISCORD_DEFAULTS)) expect(pickLink(u, '')).toBe(u);
  });
});
