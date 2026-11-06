/* Точки на карті, координати — метри гри (X схід, Y північ). Роботи посилаються на id з data/jobs.ts.
   Початкові позиції роботодавців узято з мапи QuantFun і перераховано в координати гри (похибка ~3 м). */
export type PointKind = 'job' | 'buyer';
export interface MapPoint { id: string; kind: PointKind; name: string; x: number; y: number; job?: string; note?: string }

const job = (j: string, name: string, x: number, y: number): MapPoint => ({ id: 'job-' + j, kind: 'job', name, x, y, job: j });

export const POINTS: MapPoint[] = [
  job('trucker', 'Далекобійник', 921.8, -3243.1),
  job('akvanavt', 'Акванавт', 16.8, -2803.0),
  job('forklift', 'Водій навантажувача', -419.5, -2763.4),
  job('garbage', 'Сміттяр', -618.9, -1623.8),
  job('courier', "Кур'єр", -1183.8, -1535.9),
  job('postman', 'Поштар', 138.8, 102.1),
  job('bus', 'Водій автобуса', -301.3, -922.1),
  job('mechanic', 'Механік', -435.4, -2174.4),
  job('taxi', 'Таксі', 892.7, -178.1),
  job('grocery', 'Розвізник продуктів', 2709.8, 3455.5),
  job('electrician', 'Електрик', 727.3, 130.1),
  job('detective', 'Детектив', 227.8, -382.0),
  job('inkasator', 'Інкасатор', 252.5, 209.8),
  job('carthief', 'Автовикрадач', 190.4, -2224.9),
  job('burglar', 'Крадій-домушник', 1425.7, 6335.3),
  job('firefighter', 'Пожежник', -376.6, 6121.6),
  job('lawnmower', 'Газонокосильник', -1327.8, 47.1),
  job('fastfood', 'Продавець фастфуду', 158.0, -1447.4),
  { id: 'buyer-junk', kind: 'buyer', name: 'Скупник мотлоху', x: -440.9, y: -1695.2 },
  { id: 'buyer-market', kind: 'buyer', name: 'Скупники штату', x: -1275.0, y: -1439.2, note: 'Врожай, гриби, дерево, метали, риба, шкури та інші' }
];
