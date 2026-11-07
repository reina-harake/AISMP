/**
 * The platform serves Beirut only. Keep in sync with backend/src/config/beirut.js
 * (the server checks the same rules, so they cannot be bypassed).
 */

// value = what is stored in complaints.area; labels per interface language
export const AREAS = [
  { value: 'Achrafieh', en: 'Achrafieh', ar: 'الأشرفية', fr: 'Achrafieh' },
  { value: 'Ain el-Mreisseh', en: 'Ain el-Mreisseh', ar: 'عين المريسة', fr: 'Aïn el-Mreïssé' },
  { value: 'Bachoura', en: 'Bachoura', ar: 'الباشورة', fr: 'Bachoura' },
  { value: 'Mazraa', en: 'Mazraa', ar: 'المزرعة', fr: 'Mazraa' },
  { value: 'Medawar', en: 'Medawar', ar: 'المدور', fr: 'Medawar' },
  { value: 'Minet el-Hosn', en: 'Minet el-Hosn', ar: 'ميناء الحصن', fr: 'Minet el-Hosn' },
  { value: 'Mousseitbeh', en: 'Mousseitbeh', ar: 'المصيطبة', fr: 'Moussaitbé' },
  { value: 'Port', en: 'Port (Marfaa)', ar: 'المرفأ', fr: 'Port (Marfaa)' },
  { value: 'Ras Beirut', en: 'Ras Beirut', ar: 'رأس بيروت', fr: 'Ras Beyrouth' },
  { value: 'Rmeil', en: 'Rmeil', ar: 'الرميل', fr: 'Rmeil' },
  { value: 'Saifi', en: 'Saifi', ar: 'الصيفي', fr: 'Saïfi' },
  { value: 'Zuqaq al-Blat', en: 'Zuqaq al-Blat', ar: 'زقاق البلاط', fr: 'Zokak el-Blatt' },
];

/** Display name of a stored area in the interface language (older free-text areas are shown as written). */
export function areaLabel(value, lang) {
  const a = AREAS.find((x) => x.value === value);
  return a ? a[lang] || a.en : value;
}

// Approximate outline of Beirut's municipal boundary, [lat, lng] (same as the backend)
export const BOUNDARY = [
  [33.8690, 35.4775], [33.8790, 35.4740], [33.8900, 35.4682], [33.8975, 35.4688], [33.9008, 35.4740],
  [33.9022, 35.4850], [33.9040, 35.4970], [33.9070, 35.5080], [33.9105, 35.5200], [33.9080, 35.5300],
  [33.9030, 35.5390], [33.8960, 35.5420], [33.8890, 35.5405], [33.8830, 35.5355], [33.8780, 35.5290],
  [33.8715, 35.5235], [33.8655, 35.5185], [33.8635, 35.5100], [33.8645, 35.4990], [33.8660, 35.4880],
];

export const CENTER = [33.8890, 35.5030];

export function insideBeirut(lat, lng) {
  let inside = false;
  for (let i = 0, j = BOUNDARY.length - 1; i < BOUNDARY.length; j = i++) {
    const [yi, xi] = BOUNDARY[i];
    const [yj, xj] = BOUNDARY[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
