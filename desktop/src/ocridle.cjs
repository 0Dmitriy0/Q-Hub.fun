/* коли закривати OCR зору (vision.cjs). Пам'ять WebAssembly рушія tesseract лише росте: список скупника (пів екрана,
   збільшені вдвічі — 1920×2160 на 1080p) лишає в ньому ~90 МБ, які повертає тільки terminate.
   all — зір не працює довше IDLE (гру закрито, персонажа не вибрано): закрити всі рушії;
   lists — список скупника не читали довше LIST_IDLE: закрити лише рушії списків. Тут без tesseract, щоб тести його не тягнули */
/* LIST_IDLE — 5 хв: скупників обходять колом, і запуск рушіїв списку (~1 с) біля кожного з'їдав би весь виграш швидкості
   (замір 2026-11-14); після кола пам'ять повертається */
const IDLE = 60e3, LIST_IDLE = 5 * 60e3;

function ocrRelease({ active, inactiveSince, listsAt, hasAny, hasLists, now }) {
  if (!active) return hasAny && inactiveSince && now - inactiveSince > IDLE ? 'all' : null;
  return hasLists && now - listsAt > LIST_IDLE ? 'lists' : null;
}

module.exports = { ocrRelease, IDLE, LIST_IDLE };
