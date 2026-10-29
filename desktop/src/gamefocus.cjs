/* Фокус назад у гру. Windows після hide() плашки чи мапи не віддає фокус грі (RAGE MP): гра лишається без керування
   до кліку. Тож коли гравець відкриває плашку чи мапу клавішею, запам'ятовуємо активне вікно (гру), а коли сам ховає їх
   (Esc, та сама клавіша) — повертаємо фокус йому через user32 (koffi). Перейшов в інше вікно сам — нічого не чіпаємо.
   Не Windows чи koffi не завантажився — тихо нічого не робимо. Залежності передаються ззовні, щоб логіку перевірити тестом. */

function load() {
  if (process.platform !== 'win32') return null;
  try {
    const user32 = require('koffi').load('user32.dll');
    return {
      foreground: user32.func('uintptr_t __stdcall GetForegroundWindow()'),
      activate: user32.func('bool __stdcall SetForegroundWindow(uintptr_t hwnd)'),
      alive: user32.func('bool __stdcall IsWindow(uintptr_t hwnd)'),
    };
  } catch { return null; }
}

/* HWND вікна Electron (Buffer з getNativeWindowHandle) — числом, як повертає GetForegroundWindow */
const hwndOf = buf => Number(buf.length >= 8 ? buf.readBigUInt64LE(0) : buf.readUInt32LE(0));

/* ours() — HWND наших вікон (плашка, мапа…): їх не запам'ятовуємо, це не гра */
function gameFocus({ api = load(), ours = () => [] } = {}) {
  let game = 0;
  return {
    /* клавіша плашки чи мапи натиснута — зараз на передньому плані гра */
    remember() {
      if (!api) return;
      const h = Number(api.foreground());
      if (h && !ours().includes(h)) game = h;
    },
    /* гравець сам ховає наше вікно — віддати фокус грі; true — віддали */
    giveBack() {
      if (!api || !game || !api.alive(game)) return false;
      return !!api.activate(game);
    },
  };
}

module.exports = { gameFocus, hwndOf };
