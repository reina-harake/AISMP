/**
 * Notification texts in English, Arabic and French.
 * Each notification is written in the RECIPIENT's language (users.language).
 */
const LABELS = {
  category: {
    road_damage: { en: 'road damage', ar: 'أضرار الطرق', fr: 'dégâts de voirie' },
    electricity: { en: 'electricity', ar: 'الكهرباء', fr: 'électricité' },
    water: { en: 'water', ar: 'المياه', fr: 'eau' },
    waste: { en: 'waste', ar: 'النفايات', fr: 'déchets' },
    street_lighting: { en: 'street lighting', ar: 'الإنارة العامة', fr: 'éclairage public' },
    noise: { en: 'noise', ar: 'الضجيج', fr: 'bruit' },
    illegal_construction: { en: 'illegal construction', ar: 'مخالفات البناء', fr: 'construction illégale' },
    parking: { en: 'parking and sidewalks', ar: 'المواقف والأرصفة', fr: 'stationnement et trottoirs' },
    stray_animals: { en: 'stray animals', ar: 'الحيوانات الشاردة', fr: 'animaux errants' },
    public_spaces: { en: 'parks and public spaces', ar: 'الحدائق والأماكن العامة', fr: 'parcs et espaces publics' },
    other: { en: 'other', ar: 'أخرى', fr: 'autre' },
  },
  status: {
    submitted: { en: 'submitted', ar: 'مُرسلة', fr: 'soumise' },
    under_review: { en: 'under review', ar: 'قيد المراجعة', fr: 'en cours d’examen' },
    assigned: { en: 'assigned', ar: 'مُسندة', fr: 'assignée' },
    in_progress: { en: 'in progress', ar: 'قيد التنفيذ', fr: 'en cours' },
    resolved: { en: 'resolved', ar: 'تم الحل', fr: 'résolue' },
    rejected: { en: 'rejected', ar: 'مرفوضة', fr: 'rejetée' },
    approved: { en: 'approved', ar: 'تمت الموافقة', fr: 'approuvée' },
    ready: { en: 'ready', ar: 'جاهزة', fr: 'prête' },
  },
  priority: {
    critical: { en: 'CRITICAL', ar: 'حرجة', fr: 'CRITIQUE' },
    high: { en: 'HIGH', ar: 'عالية', fr: 'HAUTE' },
    medium: { en: 'MEDIUM', ar: 'متوسطة', fr: 'MOYENNE' },
    low: { en: 'LOW', ar: 'منخفضة', fr: 'BASSE' },
  },
  dept: {
    road_damage: { en: 'Roads & Public Works', ar: 'الأشغال العامة والطرقات', fr: 'Travaux publics et voirie' },
    electricity: { en: 'Electricity', ar: 'الكهرباء', fr: 'Électricité' },
    water: { en: 'Water & Sewage', ar: 'المياه والصرف الصحي', fr: 'Eau et assainissement' },
    waste: { en: 'Waste Management', ar: 'إدارة النفايات', fr: 'Gestion des déchets' },
    street_lighting: { en: 'Street Lighting', ar: 'الإنارة العامة', fr: 'Éclairage public' },
    noise: { en: 'Municipal Police – Noise', ar: 'الشرطة البلدية – الضجيج', fr: 'Police municipale – Bruit' },
    illegal_construction: { en: 'Engineering & Building Permits', ar: 'الهندسة ورخص البناء', fr: 'Urbanisme et permis de construire' },
    parking: { en: 'Municipal Police – Traffic & Parking', ar: 'الشرطة البلدية – السير والمواقف', fr: 'Police municipale – Circulation et stationnement' },
    stray_animals: { en: 'Public Health & Animal Control', ar: 'الصحة العامة والحيوانات الشاردة', fr: 'Santé publique et animaux errants' },
    public_spaces: { en: 'Parks & Public Spaces', ar: 'الحدائق والأماكن العامة', fr: 'Parcs et espaces publics' },
    other: { en: 'General Services', ar: 'الخدمات العامة', fr: 'Services généraux' },
  },
  area: {
    Achrafieh: { en: 'Achrafieh', ar: 'الأشرفية', fr: 'Achrafieh' },
    'Ain el-Mreisseh': { en: 'Ain el-Mreisseh', ar: 'عين المريسة', fr: 'Aïn el-Mreïssé' },
    Bachoura: { en: 'Bachoura', ar: 'الباشورة', fr: 'Bachoura' },
    Mazraa: { en: 'Mazraa', ar: 'المزرعة', fr: 'Mazraa' },
    Medawar: { en: 'Medawar', ar: 'المدور', fr: 'Medawar' },
    'Minet el-Hosn': { en: 'Minet el-Hosn', ar: 'ميناء الحصن', fr: 'Minet el-Hosn' },
    Mousseitbeh: { en: 'Mousseitbeh', ar: 'المصيطبة', fr: 'Moussaitbé' },
    Port: { en: 'Port (Marfaa)', ar: 'المرفأ', fr: 'Port (Marfaa)' },
    'Ras Beirut': { en: 'Ras Beirut', ar: 'رأس بيروت', fr: 'Ras Beyrouth' },
    Rmeil: { en: 'Rmeil', ar: 'الرميل', fr: 'Rmeil' },
    Saifi: { en: 'Saifi', ar: 'الصيفي', fr: 'Saïfi' },
    'Zuqaq al-Blat': { en: 'Zuqaq al-Blat', ar: 'زقاق البلاط', fr: 'Zokak el-Blatt' },
  },
  level: {
    newcomer: { en: 'Newcomer', ar: 'مُبلِّغ جديد', fr: 'Nouveau venu' },
    active: { en: 'Active Neighbour', ar: 'جار ناشط', fr: 'Voisin actif' },
    trusted: { en: 'Trusted Reporter', ar: 'مُبلِّغ موثوق', fr: 'Signaleur de confiance' },
    guardian: { en: 'Neighbourhood Guardian', ar: 'حارس الحي', fr: 'Gardien du quartier' },
  },
  request_type: {
    residence_certificate: { en: 'residence certificate', ar: 'إفادة سكن', fr: 'certificat de résidence' },
    building_permit: { en: 'building permit', ar: 'رخصة بناء', fr: 'permis de bâtir' },
    business_license: { en: 'business license', ar: 'رخصة تجارية', fr: 'licence commerciale' },
    civil_record: { en: 'civil record', ar: 'إخراج قيد', fr: 'extrait d’état civil' },
    construction_permit: { en: 'construction permit', ar: 'رخصة إنشاءات', fr: 'permis de construire' },
    other: { en: 'document', ar: 'مستند', fr: 'document' },
  },
};

const L = (group, key, lang) => LABELS[group]?.[key]?.[lang] ?? LABELS[group]?.[key]?.en ?? key;

const TEMPLATES = {
  complaint_received: {
    en: (p) => `Your complaint #${p.id} was received and categorized as "${L('category', p.category, 'en')}".`,
    ar: (p) => `تم استلام شكواك رقم ${p.id} وتصنيفها ضمن "${L('category', p.category, 'ar')}".`,
    fr: (p) => `Votre plainte n°${p.id} a été reçue et classée dans « ${L('category', p.category, 'fr')} ».`,
  },
  new_urgent_complaint: {
    en: (p) => `New ${L('priority', p.priority, 'en')} complaint #${p.id}: ${p.title}`,
    ar: (p) => `شكوى جديدة بأولوية ${L('priority', p.priority, 'ar')} رقم ${p.id}: ${p.title}`,
    fr: (p) => `Nouvelle plainte ${L('priority', p.priority, 'fr')} n°${p.id} : ${p.title}`,
  },
  complaint_status: {
    en: (p) => `Your complaint #${p.id} is now "${L('status', p.status, 'en')}".`
      + (p.points > 0 ? ` Thanks for reporting! You earned ${p.points} points.` : '')
      + (p.points < 0 ? ` It was judged a false or abusive report: ${-p.points} points were removed.` : '')
      + (p.note ? ` Note: ${p.note}` : ''),
    ar: (p) => `أصبحت حالة شكواك رقم ${p.id}: "${L('status', p.status, 'ar')}".`
      + (p.points > 0 ? ` شكراً على التبليغ! ربحت ${p.points} نقاط.` : '')
      + (p.points < 0 ? ` اعتُبر التبليغ كاذباً أو مسيئاً، وتم خصم ${-p.points} نقطة.` : '')
      + (p.note ? ` ملاحظة: ${p.note}` : ''),
    fr: (p) => `Votre plainte n°${p.id} est maintenant « ${L('status', p.status, 'fr')} ».`
      + (p.points > 0 ? ` Merci pour votre signalement ! Vous gagnez ${p.points} points.` : '')
      + (p.points < 0 ? ` Le signalement a été jugé faux ou abusif : ${-p.points} points ont été retirés.` : '')
      + (p.note ? ` Remarque : ${p.note}` : ''),
  },
  level_up: {
    en: (p) => `Congratulations, you are now a ${L('level', p.level, 'en')}!`
      + (p.fast_track ? ' Your new complaints now go straight to the responsible team for review.' : ''),
    ar: (p) => `مبروك، صرت ${L('level', p.level, 'ar')}!`
      + (p.fast_track ? ' شكاويك الجديدة صارت توصل مباشرةً للفريق المسؤول للمراجعة.' : ''),
    fr: (p) => `Félicitations, vous êtes maintenant ${L('level', p.level, 'fr')} !`
      + (p.fast_track ? ' Vos nouvelles plaintes vont désormais directement en examen auprès de l’équipe responsable.' : ''),
  },
  complaint_fast_tracked: {
    en: (p) => `As a trusted reporter, your complaint #${p.id} went straight to review by the responsible team.`,
    ar: (p) => `لأنك مُبلِّغ موثوق، وصلت شكواك رقم ${p.id} مباشرةً للمراجعة عند الفريق المسؤول.`,
    fr: (p) => `En tant que signaleur de confiance, votre plainte n°${p.id} est passée directement en examen.`,
  },
  complaint_assigned_employee: {
    en: (p) => `Complaint #${p.id} has been assigned to you.`,
    ar: (p) => `تم إسناد الشكوى رقم ${p.id} إليك.`,
    fr: (p) => `La plainte n°${p.id} vous a été assignée.`,
  },
  complaint_assigned_citizen: {
    en: (p) => `Your complaint #${p.id} has been assigned to a municipal team.`,
    ar: (p) => `تم إسناد شكواك رقم ${p.id} إلى فريق من البلدية.`,
    fr: (p) => `Votre plainte n°${p.id} a été confiée à une équipe municipale.`,
  },
  request_received: {
    en: (p) => `Your ${L('request_type', p.type, 'en')} request #${p.id} was received.`,
    ar: (p) => `تم استلام طلب ${L('request_type', p.type, 'ar')} رقم ${p.id}.`,
    fr: (p) => `Votre demande de ${L('request_type', p.type, 'fr')} n°${p.id} a été reçue.`,
  },
  request_status: {
    en: (p) => `Your request #${p.id} is now "${L('status', p.status, 'en')}".`
      + (p.status === 'ready' ? ' Your document is ready for pickup.' : '')
      + (p.note ? ` Note: ${p.note}` : ''),
    ar: (p) => `أصبحت حالة طلبك رقم ${p.id}: "${L('status', p.status, 'ar')}".`
      + (p.status === 'ready' ? ' مستندك جاهز للاستلام.' : '')
      + (p.note ? ` ملاحظة: ${p.note}` : ''),
    fr: (p) => `Votre demande n°${p.id} est maintenant « ${L('status', p.status, 'fr')} ».`
      + (p.status === 'ready' ? ' Votre document est prêt à être retiré.' : '')
      + (p.note ? ` Remarque : ${p.note}` : ''),
  },
};

const LANGS = ['en', 'ar', 'fr'];

function render(key, lang, params) {
  const t = TEMPLATES[key];
  if (!t) throw new Error(`Unknown message ${key}`);
  return (t[lang] || t.en)(params);
}

module.exports = { render, LANGS, LABELS, label: L };
