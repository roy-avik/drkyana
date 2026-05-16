// Structured patient intake schema. Defines the group-based form flow that
// replaces the old flat BOOKING_SLOTS. Each group is a themed mini-section
// asked sequentially; individual slots within a group are asked one at a time.
//
// The schema is pure data — no React, no side effects. The Receptionist
// component walks this structure via the useIntakeFlow hook.

export type SlotType = 'single_select' | 'multi_select' | 'freetext' | 'phone' | 'number_chips';

export type LocalizedLabel = { en: string; bn: string; fa: string };

export type SlotOption = { id: string } & LocalizedLabel;

export type IntakeSlot = {
  id: string;
  type: SlotType;
  skippable?: boolean;
  options?: SlotOption[];
  numberRange?: { min: number; max: number; labels?: Record<number, LocalizedLabel> };
  phonePrefix?: string;
  placeholder?: { en: string; bn: string; fa: string };
};

export type IntakeGroup = {
  id: string;
  /** i18n key for the group transition message: `intake.group.{id}.intro` */
  slots: IntakeSlot[];
  /** If set, the group is skipped when this returns false. */
  condition?: (ctx: IntakeContext) => boolean;
};

export type IntakeContext = {
  intent: string;
  visitType?: string;
  collectedSlots: Record<string, string | string[]>;
};

// ---------------------------------------------------------------------------
// Slot options (trilingual)
// ---------------------------------------------------------------------------

const AGE_RANGES: SlotOption[] = [
  { id: 'under_18', en: 'Under 18', bn: '১৮ এর কম', fa: 'زیر ۱۸' },
  { id: '18_25', en: '18–25', bn: '১৮–২৫', fa: '۱۸–۲۵' },
  { id: '26_35', en: '26–35', bn: '২৬–৩৫', fa: '۲۶–۳۵' },
  { id: '36_45', en: '36–45', bn: '৩৬–৪৫', fa: '۳۶–۴۵' },
  { id: '46_55', en: '46–55', bn: '৪৬–৫৫', fa: '۴۶–۵۵' },
  { id: '56_65', en: '56–65', bn: '৫৬–৬৫', fa: '۵۶–۶۵' },
  { id: '65_plus', en: '65+', bn: '৬৫+', fa: '۶۵+' },
];

const GENDER_OPTIONS: SlotOption[] = [
  { id: 'male', en: 'Male', bn: 'পুরুষ', fa: 'مرد' },
  { id: 'female', en: 'Female', bn: 'মহিলা', fa: 'زن' },
  { id: 'prefer_not', en: 'Prefer not to say', bn: 'বলতে চাই না', fa: 'ترجیح می‌دهم نگویم' },
];

const AFFECTED_AREA: SlotOption[] = [
  { id: 'upper_left', en: 'Upper left', bn: 'উপরে বামে', fa: 'بالا چپ' },
  { id: 'upper_right', en: 'Upper right', bn: 'উপরে ডানে', fa: 'بالا راست' },
  { id: 'upper_front', en: 'Upper front', bn: 'উপরে সামনে', fa: 'بالا جلو' },
  { id: 'lower_left', en: 'Lower left', bn: 'নিচে বামে', fa: 'پایین چپ' },
  { id: 'lower_right', en: 'Lower right', bn: 'নিচে ডানে', fa: 'پایین راست' },
  { id: 'lower_front', en: 'Lower front', bn: 'নিচে সামনে', fa: 'پایین جلو' },
  { id: 'not_sure', en: 'Not sure', bn: 'নিশ্চিত নই', fa: 'مطمئن نیستم' },
];

const SYMPTOM_TYPES: SlotOption[] = [
  { id: 'pain', en: 'Pain', bn: 'ব্যথা', fa: 'درد' },
  { id: 'sensitivity', en: 'Sensitivity', bn: 'শিরশিরানি', fa: 'حساسیت' },
  { id: 'swelling', en: 'Swelling', bn: 'ফোলা', fa: 'تورم' },
  { id: 'bleeding', en: 'Bleeding', bn: 'রক্তপাত', fa: 'خونریزی' },
  { id: 'broken', en: 'Broken / chipped', bn: 'ভাঙা / ফাটা', fa: 'شکسته / ترک‌خورده' },
  { id: 'discoloration', en: 'Discoloration', bn: 'বিবর্ণতা', fa: 'تغییر رنگ' },
  { id: 'loose', en: 'Loose tooth', bn: 'দাঁত নড়ে', fa: 'دندان لق' },
  { id: 'other', en: 'Other', bn: 'অন্যান্য', fa: 'دیگر' },
];

const DURATION_OPTIONS: SlotOption[] = [
  { id: 'just_started', en: 'Just started', bn: 'এইমাত্র শুরু', fa: 'تازه شروع شده' },
  { id: 'few_days', en: 'Few days', bn: 'কয়েক দিন', fa: 'چند روز' },
  { id: '1_2_weeks', en: '1–2 weeks', bn: '১–২ সপ্তাহ', fa: '۱–۲ هفته' },
  { id: 'weeks_plus', en: 'Weeks+', bn: 'সপ্তাহের বেশি', fa: 'هفته‌ها+' },
  { id: 'months_plus', en: 'Months+', bn: 'মাসের বেশি', fa: 'ماه‌ها+' },
];

const SEVERITY_LABELS: Record<number, LocalizedLabel> = {
  1: { en: 'Mild', bn: 'হালকা', fa: 'خفیف' },
  5: { en: 'Moderate', bn: 'মাঝারি', fa: 'متوسط' },
  7: { en: 'Strong', bn: 'তীব্র', fa: 'شدید' },
  10: { en: 'Worst', bn: 'সবচেয়ে তীব্র', fa: 'بدترین' },
};

const TRIGGER_OPTIONS: SlotOption[] = [
  { id: 'hot', en: 'Hot', bn: 'গরম', fa: 'داغ' },
  { id: 'cold', en: 'Cold', bn: 'ঠান্ডা', fa: 'سرد' },
  { id: 'biting', en: 'Biting', bn: 'কামড়ানো', fa: 'گاز گرفتن' },
  { id: 'spontaneous', en: 'Spontaneous', bn: 'এমনিতেই', fa: 'خودبه‌خود' },
  { id: 'sweet', en: 'Sweet', bn: 'মিষ্টি', fa: 'شیرینی' },
  { id: 'none', en: 'None', bn: 'কোনোটা না', fa: 'هیچ‌کدام' },
];

const CONDITIONS: SlotOption[] = [
  { id: 'diabetes', en: 'Diabetes', bn: 'ডায়াবেটিস', fa: 'دیابت' },
  { id: 'hypertension', en: 'Hypertension', bn: 'উচ্চ রক্তচাপ', fa: 'فشار خون بالا' },
  { id: 'heart_disease', en: 'Heart disease', bn: 'হৃদরোগ', fa: 'بیماری قلبی' },
  { id: 'blood_disorder', en: 'Blood disorder', bn: 'রক্তের সমস্যা', fa: 'اختلال خونی' },
  { id: 'hepatitis', en: 'Hepatitis B/C', bn: 'হেপাটাইটিস বি/সি', fa: 'هپاتیت B/C' },
  { id: 'pregnant', en: 'Pregnancy / lactation', bn: 'গর্ভবতী / স্তন্যদান', fa: 'بارداری / شیردهی' },
  { id: 'none', en: 'None', bn: 'কিছু নেই', fa: 'هیچ‌کدام' },
];

const ALLERGIES: SlotOption[] = [
  { id: 'anesthesia', en: 'Anesthesia / lidocaine', bn: 'অ্যানেসথেসিয়া / লিডোকেইন', fa: 'بی‌حسی / لیدوکائین' },
  { id: 'penicillin', en: 'Penicillin / amoxicillin', bn: 'পেনিসিলিন / অ্যামোক্সিসিলিন', fa: 'پنی‌سیلین / آموکسی‌سیلین' },
  { id: 'latex', en: 'Latex', bn: 'ল্যাটেক্স', fa: 'لاتکس' },
  { id: 'nsaids', en: 'NSAIDs (ibuprofen)', bn: 'এনএসএআইডি (আইবুপ্রোফেন)', fa: 'ایبوپروفن (NSAID)' },
  { id: 'none', en: 'None', bn: 'কিছু নেই', fa: 'هیچ‌کدام' },
];

const LAST_VISIT: SlotOption[] = [
  { id: 'lt_6mo', en: 'Less than 6 months', bn: '৬ মাসের কম', fa: 'کمتر از ۶ ماه' },
  { id: '6_12mo', en: '6–12 months', bn: '৬–১২ মাস', fa: '۶–۱۲ ماه' },
  { id: '1_2yr', en: '1–2 years', bn: '১–২ বছর', fa: '۱–۲ سال' },
  { id: '2yr_plus', en: '2+ years', bn: '২ বছরের বেশি', fa: '۲+ سال' },
  { id: 'never', en: 'Never', bn: 'কখনো না', fa: 'هرگز' },
];

const ANXIETY_LEVEL: SlotOption[] = [
  { id: 'low', en: 'Low', bn: 'কম', fa: 'کم' },
  { id: 'moderate', en: 'Moderate', bn: 'মাঝারি', fa: 'متوسط' },
  { id: 'high', en: 'High', bn: 'বেশি', fa: 'زیاد' },
];

const PREFERRED_DAYS: SlotOption[] = [
  { id: 'sat', en: 'Sat', bn: 'শনি', fa: 'شنبه' },
  { id: 'sun', en: 'Sun', bn: 'রবি', fa: 'یکشنبه' },
  { id: 'mon', en: 'Mon', bn: 'সোম', fa: 'دوشنبه' },
  { id: 'tue', en: 'Tue', bn: 'মঙ্গল', fa: 'سه‌شنبه' },
  { id: 'wed', en: 'Wed', bn: 'বুধ', fa: 'چهارشنبه' },
  { id: 'thu', en: 'Thu', bn: 'বৃহঃ', fa: 'پنجشنبه' },
];

const TIME_OF_DAY: SlotOption[] = [
  { id: 'morning', en: 'Morning', bn: 'সকাল', fa: 'صبح' },
  { id: 'afternoon', en: 'Afternoon', bn: 'বিকাল', fa: 'بعد از ظهر' },
  { id: 'evening', en: 'Evening', bn: 'সন্ধ্যা', fa: 'عصر' },
];

const URGENCY: SlotOption[] = [
  { id: 'emergency', en: 'Emergency', bn: 'জরুরি', fa: 'اورژانس' },
  { id: 'this_week', en: 'This week', bn: 'এই সপ্তাহে', fa: 'این هفته' },
  { id: 'within_2_weeks', en: 'Within 2 weeks', bn: '২ সপ্তাহের মধ্যে', fa: 'ظرف ۲ هفته' },
  { id: 'flexible', en: 'Flexible', bn: 'নমনীয়', fa: 'انعطاف‌پذیر' },
];

const PAYMENT: SlotOption[] = [
  { id: 'self_pay', en: 'Self-pay', bn: 'নিজে পরিশোধ', fa: 'پرداخت شخصی' },
  { id: 'insurance', en: 'Insurance', bn: 'বীমা', fa: 'بیمه' },
];

// Visit type options (reused from old BOOKING_SLOTS, now part of the complaint group intro)
export const VISIT_TYPE_OPTIONS: SlotOption[] = [
  { id: 'cleaning', en: 'Cleaning / scaling', bn: 'ক্লিনিং / স্কেলিং', fa: 'جرم‌گیری' },
  { id: 'pain', en: 'Tooth pain', bn: 'দাঁতের ব্যথা', fa: 'دندان درد' },
  { id: 'filling', en: 'Filling / cavity', bn: 'ফিলিং / গর্ত', fa: 'پر کردن' },
  { id: 'rct', en: 'Root canal', bn: 'রুট ক্যানেল', fa: 'درمان ریشه' },
  { id: 'consult', en: 'Consultation', bn: 'পরামর্শ', fa: 'مشاوره' },
  { id: 'other', en: 'Other', bn: 'অন্যান্য', fa: 'دیگر' },
];

// ---------------------------------------------------------------------------
// Group definitions
// ---------------------------------------------------------------------------

export const INTAKE_GROUPS: IntakeGroup[] = [
  {
    id: 'identity',
    slots: [
      { id: 'full_name', type: 'freetext', placeholder: { en: 'Your full name', bn: 'আপনার পূর্ণ নাম', fa: 'نام کامل شما' } },
      { id: 'phone', type: 'freetext', placeholder: { en: '+880 1XXXXXXXXX', bn: '+৮৮০ ১XXXXXXXXX', fa: '+۸۸۰ ۱XXXXXXXXX' } },
      { id: 'email', type: 'freetext', skippable: true, placeholder: { en: 'your@email.com (optional)', bn: 'your@email.com (ঐচ্ছিক)', fa: 'your@email.com (اختیاری)' } },
      { id: 'age_range', type: 'single_select', options: AGE_RANGES },
      { id: 'gender', type: 'single_select', options: GENDER_OPTIONS },
    ],
  },
  {
    id: 'complaint',
    condition: (ctx) => ctx.visitType !== 'consult',
    slots: [
      { id: 'visit_type', type: 'single_select', options: VISIT_TYPE_OPTIONS },
      { id: 'affected_area', type: 'single_select', options: AFFECTED_AREA },
      { id: 'symptoms', type: 'multi_select', options: SYMPTOM_TYPES },
      { id: 'duration', type: 'single_select', options: DURATION_OPTIONS },
      { id: 'severity', type: 'number_chips', numberRange: { min: 1, max: 10, labels: SEVERITY_LABELS } },
      { id: 'triggers', type: 'multi_select', options: TRIGGER_OPTIONS },
    ],
  },
  {
    id: 'medical',
    slots: [
      { id: 'conditions', type: 'multi_select', options: CONDITIONS },
      { id: 'allergies', type: 'multi_select', options: ALLERGIES },
      { id: 'medications', type: 'freetext', skippable: true, placeholder: { en: 'e.g. metformin, aspirin, blood thinners…', bn: 'যেমন মেটফর্মিন, অ্যাসপিরিন, রক্ত পাতলাকারী…', fa: 'مثلاً متفورمین، آسپرین، رقیق‌کننده خون…' } },
    ],
  },
  {
    id: 'dental_history',
    slots: [
      { id: 'last_visit', type: 'single_select', options: LAST_VISIT },
      { id: 'anxiety', type: 'single_select', options: ANXIETY_LEVEL },
    ],
  },
  {
    id: 'logistics',
    slots: [
      { id: 'preferred_area', type: 'freetext', placeholder: { en: 'Area in Dhaka, e.g. Dhanmondi, Gulshan…', bn: 'ঢাকায় এলাকা, যেমন ধানমন্ডি, গুলশান…', fa: 'منطقه در داکا، مثلاً دانموندی، گلشان…' } },
      { id: 'preferred_days', type: 'multi_select', options: PREFERRED_DAYS },
      { id: 'time_of_day', type: 'single_select', options: TIME_OF_DAY },
      { id: 'urgency', type: 'single_select', options: URGENCY },
      { id: 'payment', type: 'single_select', options: PAYMENT },
    ],
  },
];

// Urgent fast-track: only identity essentials + complaint essentials
export const URGENT_GROUPS: IntakeGroup[] = [
  {
    id: 'identity',
    slots: [
      { id: 'full_name', type: 'freetext', placeholder: { en: 'Your full name', bn: 'আপনার পূর্ণ নাম', fa: 'নام کامل شما' } },
      { id: 'phone', type: 'freetext', placeholder: { en: '+880 1XXXXXXXXX', bn: '+৮৮০ ১XXXXXXXXX', fa: '+۸۸۰ ۱XXXXXXXXX' } },
    ],
  },
  {
    id: 'complaint',
    slots: [
      { id: 'affected_area', type: 'single_select', options: AFFECTED_AREA },
      { id: 'symptoms', type: 'multi_select', options: SYMPTOM_TYPES },
    ],
  },
];

// Consultation flow: skip detailed complaint, keep everything else
export const CONSULT_GROUPS: IntakeGroup[] = [
  INTAKE_GROUPS[0], // identity
  {
    id: 'complaint',
    slots: [
      { id: 'visit_type', type: 'single_select', options: VISIT_TYPE_OPTIONS },
    ],
  },
  INTAKE_GROUPS[2], // medical
  INTAKE_GROUPS[3], // dental_history
  INTAKE_GROUPS[4], // logistics
];

export function getGroupsForFlow(intent: string, visitType?: string): IntakeGroup[] {
  if (intent === 'urgent') return URGENT_GROUPS;
  if (visitType === 'consult') return CONSULT_GROUPS;
  return INTAKE_GROUPS;
}

export function localizeOption(opt: LocalizedLabel, lang: string): string {
  return lang === 'bn' ? opt.bn : lang === 'fa' ? opt.fa : opt.en;
}
