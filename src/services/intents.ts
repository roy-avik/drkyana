// Canonical receptionist intents. Each one has:
//
// - id: string used as the i18n key suffix (`receptionist.intent.<id>.*`) and
//   the marker in the outgoing WhatsApp message.
// - examples: 3-8 short example phrases used as the embedding "centroid" for
//   nearest-neighbor classification. Keep them realistic and concise. Mix EN
//   and BN where the model supports both — the multilingual encoder maps them
//   into the same vector space so a Bengali message about pain will land near
//   an English pain example.
// - kind: 'booking' triggers the multi-turn slot-filling flow;
//         'response' shows a one-shot bot message + WhatsApp CTA.
// - severity (optional): 'urgent' styles the response card prominently.

export type IntentId =
  | 'book_appointment'
  | 'reschedule'
  | 'urgent'
  | 'ask_hours'
  | 'ask_location'
  | 'ask_services'
  | 'ask_pricing'
  | 'ask_insurance'
  | 'greeting'
  | 'other';

export type Intent = {
  id: IntentId;
  kind: 'booking' | 'response';
  severity?: 'urgent';
  examples: string[];
};

export const INTENTS: Intent[] = [
  {
    id: 'book_appointment',
    kind: 'booking',
    examples: [
      "I'd like to book an appointment",
      'Can I make an appointment for next week',
      'I want to see Dr Kyana',
      'How do I schedule a visit',
      'Need to book a cleaning',
      'I need to extract my wisdom tooth',
      'I have a cavity that needs filling',
      'My tooth needs a root canal',
      'I want to get my teeth checked',
      'আমি একটা অ্যাপয়েন্টমেন্ট নিতে চাই',
      'ডাঃ কিয়ানার সাথে দেখা করতে চাই',
      'দাঁত পরিষ্কারের জন্য সময় নিতে চাই',
      'আমার আক্কেল দাঁত ফেলতে হবে',
      'দাঁতে গর্ত হয়েছে ভরাট করতে হবে',
    ],
  },
  {
    id: 'reschedule',
    kind: 'response',
    examples: [
      'I need to reschedule my appointment',
      'Can I move my appointment to another day',
      'Cancel my booking',
      'Change appointment time',
      'আমার অ্যাপয়েন্টমেন্ট পরিবর্তন করতে চাই',
      'বুকিং বাতিল করুন',
    ],
  },
  {
    id: 'urgent',
    kind: 'response',
    severity: 'urgent',
    examples: [
      'My tooth is bleeding and will not stop',
      'I knocked out a tooth, what do I do',
      'Severe pain, my face is swollen',
      "I'm in agony, the pain is unbearable",
      'Broken tooth from a fall',
      'Wisdom tooth pain is killing me',
      'দাঁত থেকে রক্ত পড়ছে',
      'খুব ব্যথা করছে সহ্য করতে পারছি না',
      'মুখ ফুলে গেছে',
      'দাঁত ভেঙে গেছে',
      'আক্কেল দাঁতে অসহ্য ব্যথা',
    ],
  },
  {
    id: 'ask_hours',
    kind: 'response',
    examples: [
      'What are your hours',
      'When are you open',
      'Are you available on weekends',
      'Do you work on Friday',
      'আপনার সময়সূচী কী',
      'কখন খোলা থাকে',
    ],
  },
  {
    id: 'ask_location',
    kind: 'response',
    examples: [
      'Where is your clinic',
      'What is your address',
      'Where do you see patients',
      'Which area of Dhaka',
      'Can you tell me the location',
      'আপনি কোথায় বসেন',
      'ক্লিনিকটা কোথায়',
      'ঠিকানা কী',
    ],
  },
  {
    id: 'ask_services',
    kind: 'response',
    examples: [
      'What services do you offer',
      'Do you do root canal',
      'Can you do scaling and cleaning',
      'What treatments are available',
      'Do you do fillings',
      'আপনি কী কী চিকিৎসা করেন',
      'রুট ক্যানেল করেন',
      'স্কেলিং করা যায়',
    ],
  },
  {
    id: 'ask_pricing',
    kind: 'response',
    examples: [
      'How much does a cleaning cost',
      'What are your fees',
      'Price for a root canal',
      'How much will this cost me',
      'খরচ কত',
      'ফি কত',
      'রুট ক্যানেলের দাম',
    ],
  },
  {
    id: 'ask_insurance',
    kind: 'response',
    examples: [
      'Do you accept insurance',
      'Can I claim this on my insurance',
      'Do you take cards',
      'How do I pay',
      'বীমা গ্রহণ করেন',
      'পেমেন্ট কীভাবে',
    ],
  },
  {
    id: 'greeting',
    kind: 'response',
    examples: [
      'Hello',
      'Hi there',
      'Good morning',
      'Is this Dr Kyana',
      'হ্যালো',
      'নমস্কার',
      'শুভ সকাল',
    ],
  },
  {
    id: 'other',
    kind: 'response',
    // 'other' has no examples — it's the fallback when the top-1 confidence
    // is below the OTHER_THRESHOLD (see intentClassifier.ts).
    examples: [],
  },
];

export function findIntent(id: IntentId): Intent {
  const intent = INTENTS.find((i) => i.id === id);
  if (!intent) throw new Error(`unknown intent: ${id}`);
  return intent;
}
