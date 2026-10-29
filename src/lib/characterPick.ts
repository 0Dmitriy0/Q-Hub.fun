/* з якого персонажа вписати ціну вручну (specs/025 FR-015): 0 — спершу додати персонажа; 1 — без питання; 2–3 — спитати,
   підказка — поточний персонаж. «Зір» програми не питає: бере персонажа, під яким зайшли */
export interface PickChar { id: string; name: string; static_id?: number | null }
export type PickPlan =
  | { kind: 'none'; error: string }
  | { kind: 'auto'; id: string }
  | { kind: 'ask'; options: PickChar[]; suggested: string };

export function pickPlan(chars: PickChar[], currentId?: string | null): PickPlan {
  /* без статіку база ціну не прийме — такого персонажа не пропонуємо */
  const ok = chars.filter(c => c.static_id);
  if (!chars.length) return { kind: 'none', error: 'Спершу додай персонажа — у програмі Q-Hub.' };
  if (!ok.length) return { kind: 'none', error: 'Вкажи статік персонажа — у програмі Q-Hub, «Персонажі й профіль…».' };
  if (ok.length === 1) return { kind: 'auto', id: ok[0].id };
  return { kind: 'ask', options: ok, suggested: ok.some(c => c.id === currentId) ? currentId! : ok[0].id };
}
