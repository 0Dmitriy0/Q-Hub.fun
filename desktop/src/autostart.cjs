/* автозапуск з Windows при старті програми (specs/009): що записати в реєстр. null — нічого не міняти.
   Перший запуск версії з 009 (init ще не було): новий гравець — увімкнути (FR-011); хто вже мав Q-Hub — як було,
   зокрема старий запис 0.3.x переноситься (FR-012). Далі увімкнений автозапуск щоразу перезаписується —
   після перевстановлення в іншу теку він веде на актуальну (FR-013).
   chosen — вибір гравця в інсталяторі (specs/008, installer.json): він важливіший за все інше */
function autostartOnStart({ init, hadSettings, oldOn, on, chosen }) {
  if (typeof chosen === 'boolean') return chosen;
  if (!init) return !hadSettings || oldOn || on;
  return on ? true : null;
}
module.exports = { autostartOnStart };
