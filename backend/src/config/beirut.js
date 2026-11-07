/**
 * The platform serves Beirut only: complaints must name one of its 12 districts, and a map
 * location (optional) must fall inside the city. Keep in sync with frontend/src/beirut.js.
 */

// Stored in complaints.area exactly as written here (English name); the UI translates them.
const AREAS = [
  'Achrafieh', 'Ain el-Mreisseh', 'Bachoura', 'Mazraa', 'Medawar', 'Minet el-Hosn',
  'Mousseitbeh', 'Port', 'Ras Beirut', 'Rmeil', 'Saifi', 'Zuqaq al-Blat',
];

// Approximate outline of Beirut's municipal boundary, [lat, lng]: the coast from Ramlet al-Bayda
// round Ras Beirut and the port to the Beirut River, then back along the southern limit.
// Simplified by hand; replace with the official boundary GeoJSON for production use.
const BOUNDARY = [
  [33.8690, 35.4775], [33.8790, 35.4740], [33.8900, 35.4682], [33.8975, 35.4688], [33.9008, 35.4740],
  [33.9022, 35.4850], [33.9040, 35.4970], [33.9070, 35.5080], [33.9105, 35.5200], [33.9080, 35.5300],
  [33.9030, 35.5390], [33.8960, 35.5420], [33.8890, 35.5405], [33.8830, 35.5355], [33.8780, 35.5290],
  [33.8715, 35.5235], [33.8655, 35.5185], [33.8635, 35.5100], [33.8645, 35.4990], [33.8660, 35.4880],
];

/** Ray-casting point-in-polygon test. */
function insideBeirut(lat, lng) {
  let inside = false;
  for (let i = 0, j = BOUNDARY.length - 1; i < BOUNDARY.length; j = i++) {
    const [yi, xi] = BOUNDARY[i];
    const [yj, xj] = BOUNDARY[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// District names as people write them (EN / AR / Arabizi / FR) -> canonical name. Used by the chatbot.
const AREA_ALIASES = {
  Achrafieh: ['achrafieh', 'achrafie', 'ashrafieh', 'ashrafiye', 'ashrafiyeh', 'ashrafiyye', 'achrafiyeh', 'الأشرفية', 'الاشرفية', 'اشرفية'],
  'Ain el-Mreisseh': ['ain el mreisseh', 'ain el-mreisseh', 'ain mreisseh', 'ain el mreiseh', '3ein el mreisseh', '3ain el mreisse', 'aïn el-mreïssé', 'عين المريسة', 'عين المريسه'],
  Bachoura: ['bachoura', 'bashoura', 'bachoura', 'الباشورة', 'الباشوره', 'باشورة'],
  Mazraa: ['mazraa', 'mazra3a', 'mazraa', 'el mazraa', 'المزرعة', 'المزرعه'],
  Medawar: ['medawar', 'mdawwar', 'mdawar', 'el medawar', 'المدور', 'المدوّر'],
  'Minet el-Hosn': ['minet el hosn', 'minet el-hosn', 'mina el hosn', 'minet el 7osn', 'ميناء الحصن', 'مينا الحصن'],
  Mousseitbeh: ['mousseitbeh', 'mousaitbeh', 'msaytbe', 'msaitbeh', 'moussaitbé', 'المصيطبة', 'المصيطبه'],
  Port: ['port', 'marfaa', 'marfa2', 'el marfa2', 'port of beirut', 'le port', 'المرفأ', 'المرفا'],
  'Ras Beirut': ['ras beirut', 'ras beyrouth', 'ras bayrut', 'hamra', 'el hamra', 'راس بيروت', 'رأس بيروت', 'الحمرا', 'الحمراء'],
  Rmeil: ['rmeil', 'rmeyl', 'el rmeil', 'الرميل'],
  Saifi: ['saifi', 'saïfi', 'el saifi', 'الصيفي'],
  'Zuqaq al-Blat': ['zuqaq al blat', 'zuqaq al-blat', 'zokak el blat', 'zoukak el blatt', 'zo2a2 el blat', 'zkak el blat', 'زقاق البلاط'],
};

// Well-known places OUTSIDE Beirut municipality. If a chat message names one, the complaint is refused.
const OUTSIDE_PLACES = [
  'jounieh', 'jounie', 'jbeil', 'byblos', 'tripoli', 'trablos', 'saida', 'sidon', 'tyre', 'zahle', 'zahleh', 'baalbek',
  'nabatieh', 'batroun', 'aley', 'broummana', 'baabda', 'hazmieh', 'hadath', 'dekwaneh', 'jdeideh', 'sin el fil', 'bourj hammoud',
  'burj hammoud', 'antelias', 'dbayeh', 'zalka', 'jal el dib', 'dahieh', 'dahiyeh', 'dahye', 'ghobeiry', 'chiyah', 'haret hreik',
  'khaldeh', 'choueifat', 'damour', 'kesrouan', 'metn', 'chouf', 'akkar', 'bekaa',
  'جونية', 'جبيل', 'طرابلس', 'صيدا', 'زحلة', 'بعلبك', 'النبطية', 'البترون', 'بعبدا', 'الحازمية', 'الحدث', 'الدكوانة',
  'سن الفيل', 'برج حمود', 'انطلياس', 'الضبية', 'الضاحية', 'الغبيري', 'الشياح', 'حارة حريك', 'خلدة', 'الشويفات', 'الدامور',
  'كسروان', 'المتن', 'الشوف', 'عكار', 'البقاع',
];

// lowercase, punctuation -> spaces, Arabic attached prefixes removed: "بالأشرفية", "عالأشرفية" -> "الأشرفية"
const norm = (s) => ` ${String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  .replace(/(^|\s)[وف]?[بلعك]?ال/g, '$1ال')} `;
// Arabic words take a one-letter prefix ("بجونية" = in Jounieh, "لعين المريسة"): try those forms too
const contains = (text, phrase) => {
  const t = norm(text);
  const p = norm(phrase).trim();
  return [''].concat(/^[؀-ۿ]/.test(p) && !p.startsWith('ال') ? ['ب', 'ل', 'و', 'ع', 'وب'] : [])
    .some((pre) => t.includes(` ${pre}${p} `));
};

/** Canonical district named in a free text, or null. */
function areaInText(text) {
  for (const [area, aliases] of Object.entries(AREA_ALIASES)) {
    if (aliases.some((a) => contains(text, a))) return area;
  }
  return null;
}

/** Place outside Beirut named in a free text, or null. */
function outsidePlaceInText(text) {
  return OUTSIDE_PLACES.find((p) => contains(text, p)) || null;
}

module.exports = { AREAS, BOUNDARY, insideBeirut, areaInText, outsidePlaceInText };
