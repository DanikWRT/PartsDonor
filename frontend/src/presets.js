// ===========================================================================
// PartsDonor BLD-4: Библиотека готовых пресетов запчастей.
// ---------------------------------------------------------------------------
// Статические данные (константы, без БД). Согласованы со справочником
// partsdoror_parts_reference.md (раздел 3 — 26 SVG-пресетов с формами/размерами/
// цветами/z-index, viewBox 400x800) и partspresets_keys.json (56 ключей
// category/key/name_ru, согласовано с blueprint iPhone 13 Pro).
//
// Геометрия преобразована из справочной системы 400x800 в рабочую систему
// холста редактора (viewBox=340x640): X' = X*0.9059 - 11.18, Y' = Y*0.8389 - 15.56
// (масштаб рамки корпуса телефона редактора 308x604 на справочную 340x720).
// Каждый пресет: key (из keys.json), name (RU), cat (категория), shape
// (rect|circle|polygon — типы фигур редактора) и g (геометрия в координатах
// холста 340x640), fill, z (порядок отрисовки из справочника).
// ===========================================================================

export const PRESET_CATEGORIES = [
  { id: 'screen', label: 'Дисплей' },
  { id: 'battery', label: 'Аккумулятор' },
  { id: 'camera', label: 'Камера' },
  { id: 'coil', label: 'Катушка / зарядка' },
  { id: 'charging', label: 'Разъёмы / порты' },
  { id: 'board', label: 'Плата' },
  { id: 'speaker', label: 'Динамик' },
  { id: 'buzzer', label: 'Звонок' },
  { id: 'btn-power', label: 'Кнопки питания' },
  { id: 'btn-vol', label: 'Кнопки громкости' },
  { id: 'mic', label: 'Микрофон' },
  { id: 'backglass', label: 'Корпус / крышка' },
  { id: 'vibration', label: 'Вибромотор' },
  { id: 'antenna', label: 'Антенна' },
  { id: 'proximity', label: 'Датчики' },
  { id: 'housing', label: 'Расходники' },
]

// Универсальная функция построения геометрии полигона (тонкая полоса-флекс).
export const PRESETS = [
  // ------------------------------- Дисплей -------------------------------
  { key: 'display-assembly', name: 'Дисплей в сборе с тачскрином', cat: 'screen', shape: 'rect', g: { x: 16.0, y: 18.0, w: 308.0, h: 604.0, rx: 30 }, fill: '#1a2230', z: 5 },
  { key: 'display-matrix', name: 'Матрица дисплея', cat: 'screen', shape: 'rect', g: { x: 20.5, y: 22.2, w: 298.9, h: 595.6, rx: 18 }, fill: '#fff59d', z: 4 },
  { key: 'display-glass', name: 'Стекло дисплея (для переклейки)', cat: 'screen', shape: 'rect', g: { x: 20.5, y: 22.2, w: 298.9, h: 218.1, rx: 30 }, fill: '#80d8ff', z: 9 },
  { key: 'touchscreen', name: 'Тачскрин (сенсорное стекло)', cat: 'screen', shape: 'rect', g: { x: 20.5, y: 22.2, w: 298.9, h: 58.7, rx: 30 }, fill: '#e8eaed', z: 4 },
  // ------------------------------- Аккумулятор ----------------------------
  { key: 'battery', name: 'Аккумулятор (АКБ)', cat: 'battery', shape: 'rect', g: { x: 97.5, y: 210.9, w: 144.9, h: 251.7, rx: 12 }, fill: '#2e7d32', z: 6 },
  { key: 'battery-cell', name: 'Ячейка (банка) аккумулятора', cat: 'battery', shape: 'rect', g: { x: 115.6, y: 236.1, w: 108.7, h: 151.0, rx: 10 }, fill: '#388e3c', z: 6 },
  // ------------------------------- Камера ---------------------------------
  { key: 'camera-rear', name: 'Камера задняя', cat: 'camera', shape: 'circle', g: { cx: 65.8, cy: 85.1, r: 38 }, fill: '#212121', z: 8 },
  { key: 'camera-front', name: 'Камера фронтальная (селфи)', cat: 'camera', shape: 'circle', g: { cx: 142.8, cy: 33.1, r: 10 }, fill: '#000000', z: 8 },
  { key: 'camera-glass', name: 'Стекло камеры', cat: 'camera', shape: 'circle', g: { cx: 65.8, cy: 185.8, r: 42 }, fill: '#cfd8dc', z: 7 },
  { key: 'camera-module', name: 'Модуль/плата камеры', cat: 'camera', shape: 'rect', g: { x: 48, y: 62, w: 130, h: 96, rx: 10 }, fill: '#37474f', z: 7 },
  // ------------------------------- Катушка / зарядка ---------------------
  { key: 'magsafe-magnet', name: 'Магнит беспроводной зарядки MagSafe', cat: 'coil', shape: 'circle', g: { cx: 142.8, cy: 320.0, r: 59 }, fill: '#b71c1c', z: 2 },
  { key: 'wireless-charge-coil', name: 'Катушка (модуль) беспроводной зарядки', cat: 'coil', shape: 'circle', g: { cx: 142.8, cy: 420.7, r: 50 }, fill: '#6d4c41', z: 3 },
  // ------------------------------- Разъёмы / порты -----------------------
  { key: 'charging-port-lightning', name: 'Разъём зарядки Lightning', cat: 'charging', shape: 'rect', g: { x: 156.4, y: 571.7, w: 27.2, h: 16.8, rx: 2 }, fill: '#3e2723', z: 8 },
  { key: 'charging-port-typec', name: 'Разъём зарядки Type-C', cat: 'charging', shape: 'rect', g: { x: 156.4, y: 571.7, w: 27.2, h: 16.8, rx: 2 }, fill: '#4e342e', z: 8 },
  { key: 'charging-port-sim', name: 'Коннектор/разъём SIM', cat: 'charging', shape: 'rect', g: { x: 43.2, y: 563.3, w: 72.5, h: 15.1, rx: 2 }, fill: '#90a4ae', z: 7 },
  { key: 'sim-tray', name: 'Контейнер (лоток) SIM', cat: 'charging', shape: 'rect', g: { x: 43.2, y: 538.1, w: 72.5, h: 15.1, rx: 2 }, fill: '#90a4ae', z: 7 },
  // ------------------------------- Плата ----------------------------------
  { key: 'motherboard', name: 'Материнская плата', cat: 'board', shape: 'rect', g: { x: 34.1, y: 202.6, w: 271.8, h: 318.8, rx: 6 }, fill: '#37474f', z: 6 },
  { key: 'motherboard-upper', name: 'Материнская плата (верхняя часть)', cat: 'board', shape: 'rect', g: { x: 34.1, y: 202.6, w: 271.8, h: 134.2, rx: 6 }, fill: '#455a64', z: 6 },
  { key: 'ic-chip', name: 'Микросхема (контроллер, чип)', cat: 'board', shape: 'rect', g: { x: 97.5, y: 236.1, w: 36.2, h: 40.3, rx: 2 }, fill: '#000000', z: 7 },
  { key: 'board-flex', name: 'Шлейф/плата системного разъёма', cat: 'board', shape: 'rect', g: { x: 156.4, y: 521.3, w: 22.6, h: 67.1, rx: 4 }, fill: '#f9a825', z: 4 },
  // ------------------------------- Кнопки ---------------------------------
  { key: 'btn-power-flex', name: 'Шлейф кнопки включения', cat: 'btn-power', shape: 'polygon', g: { points: [[326, 190], [338, 190], [338, 340], [326, 340]] }, fill: '#f9a825', z: 4 },
  { key: 'btn-power', name: 'Кнопка включения', cat: 'btn-power', shape: 'rect', g: { x: 284.1, y: 152.2, w: 10.9, h: 50.3, rx: 3 }, fill: '#757575', z: 7 },
  { key: 'btn-vol-up', name: 'Кнопка громкости (вверх)', cat: 'btn-vol', shape: 'rect', g: { x: 284.1, y: 219.3, w: 10.9, h: 41.9, rx: 3 }, fill: '#757575', z: 7 },
  { key: 'btn-vol-down', name: 'Кнопка громкости (вниз)', cat: 'btn-vol', shape: 'rect', g: { x: 284.1, y: 265.5, w: 10.9, h: 41.9, rx: 3 }, fill: '#757575', z: 7 },
  // ------------------------------- Динамик / Звонок -----------------------
  { key: 'speaker', name: 'Динамик (speaker)', cat: 'speaker', shape: 'rect', g: { x: 133.8, y: 571.7, w: 81.5, h: 25.2, rx: 6 }, fill: '#9e9e9e', z: 7 },
  { key: 'speaker-mesh', name: 'Сетка динамика', cat: 'speaker', shape: 'circle', g: { cx: 115.6, cy: 85.1, r: 7 }, fill: '#616161', z: 9 },
  { key: 'buzzer', name: 'Звонок (buzzer)', cat: 'buzzer', shape: 'rect', g: { x: 242.5, y: 437.4, w: 54.4, h: 50.3, rx: 10 }, fill: '#607d8b', z: 7 },
  // ------------------------------- Микрофон -------------------------------
  { key: 'mic-bottom', name: 'Микрофон (нижний)', cat: 'mic', shape: 'circle', g: { cx: 183.6, cy: 563.3, r: 5 }, fill: '#212121', z: 8 },
  { key: 'mic-top', name: 'Микрофон (верхний/разговорный)', cat: 'mic', shape: 'circle', g: { cx: 183.6, cy: 85.1, r: 5 }, fill: '#212121', z: 8 },
  // ------------------------------- Корпус / крышка ------------------------
  { key: 'back-glass', name: 'Заднее стекло/крышка', cat: 'backglass', shape: 'rect', g: { x: 16.0, y: 18.0, w: 308.0, h: 604.0, rx: 30 }, fill: '#b0bec5', z: 1 },
  { key: 'phone-frame', name: 'Рамка (средняя часть) корпуса', cat: 'backglass', shape: 'rect', g: { x: 12.4, y: 18.0, w: 315.2, h: 604.0, rx: 28 }, fill: '#78909c', z: 1 },
  { key: 'camera-glass-back', name: 'Стекло блока (модуля) камеры', cat: 'backglass', shape: 'circle', g: { cx: 65.8, cy: 120.0, r: 50 }, fill: '#cfd8dc', z: 2 },
  // ------------------------------- Вибромотор ----------------------------
  { key: 'vibrator-motor', name: 'Вибромотор', cat: 'vibration', shape: 'rect', g: { x: 215.3, y: 487.8, w: 54.4, h: 75.5, rx: 8 }, fill: '#616161', z: 7 },
  { key: 'taptic-engine', name: 'Линейный вибромотор (Taptic Engine)', cat: 'vibration', shape: 'rect', g: { x: 215.3, y: 471.0, w: 63.4, h: 92.3, rx: 8 }, fill: '#546e7a', z: 7 },
  // ------------------------------- Антенна --------------------------------
  { key: 'antenna-flex', name: 'Шлейф (провод) антенны', cat: 'antenna', shape: 'polygon', g: { points: [[40, 30], [330, 30], [330, 41], [40, 41]] }, fill: '#eceff1', z: 6 },
  // ------------------------------- Датчики --------------------------------
  { key: 'proximity-sensor', name: 'Датчик приближения/освещённости', cat: 'proximity', shape: 'rect', g: { x: 115.6, y: 30.6, w: 54.4, h: 20.1, rx: 6 }, fill: '#263238', z: 8 },
  // ------------------------------- Расходники -----------------------------
  { key: 'frame-adhesive', name: 'Скотч (клей) задней крышки', cat: 'housing', shape: 'polygon', g: { points: [[24, 50], [316, 50], [316, 59], [24, 59]] }, fill: '#ffd54f', z: 3 },
]

// Разрешение ссылок на точки полигона в формат фигур редактора
// { x, y, ... }[] (точки из PRESETS[].g.points = [[x,y], ...]).
export function polygonPointsToFigures(points) {
  if (!Array.isArray(points)) return []
  return points.map((p) => ({ x: p[0], y: p[1] }))
}

