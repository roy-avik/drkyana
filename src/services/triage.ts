// Deterministic rule-based dental triage. No ML, no hallucination risk.
// Runs after complaint data is collected; complements the first-message
// `urgent` intent classifier with a more nuanced post-collection assessment.

export type TriageLevel = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN';

export type TriageResult = {
  level: TriageLevel;
  label: { en: string; bn: string; fa: string };
  action: 'fast_track' | 'priority' | 'normal';
  hospitalAdvice: boolean;
};

export type ComplaintData = {
  symptoms?: string[];
  severity?: number;
  duration?: string;
  triggers?: string[];
};

const LABELS: Record<TriageLevel, { en: string; bn: string; fa: string }> = {
  RED: { en: 'Emergency', bn: 'জরুরি', fa: 'اورژانس' },
  ORANGE: { en: 'Urgent', bn: 'জরুরি (শীঘ্রই)', fa: 'فوری' },
  YELLOW: { en: 'Soon', bn: 'শীঘ্রই', fa: 'به‌زودی' },
  GREEN: { en: 'Routine', bn: 'রুটিন', fa: 'عادی' },
};

export function assessTriage(complaint: ComplaintData): TriageResult {
  const symptoms = new Set(complaint.symptoms ?? []);
  const severity = complaint.severity ?? 0;

  // RED: combinations suggesting a dental emergency that may need hospital
  if (
    (symptoms.has('swelling') && severity >= 8) ||
    (symptoms.has('bleeding') && severity >= 9) ||
    (symptoms.has('swelling') && symptoms.has('bleeding'))
  ) {
    return { level: 'RED', label: LABELS.RED, action: 'fast_track', hospitalAdvice: true };
  }

  // ORANGE: severe but not hospital-level
  if (
    severity >= 8 ||
    (symptoms.has('swelling') && severity >= 5) ||
    (symptoms.has('broken') && severity >= 6)
  ) {
    return { level: 'ORANGE', label: LABELS.ORANGE, action: 'priority', hospitalAdvice: false };
  }

  // YELLOW: moderate, needs attention within days
  if (
    severity >= 5 ||
    symptoms.has('swelling') ||
    symptoms.has('broken') ||
    symptoms.has('bleeding') ||
    symptoms.has('loose')
  ) {
    return { level: 'YELLOW', label: LABELS.YELLOW, action: 'normal', hospitalAdvice: false };
  }

  // GREEN: routine
  return { level: 'GREEN', label: LABELS.GREEN, action: 'normal', hospitalAdvice: false };
}

export function triageColor(level: TriageLevel): string {
  switch (level) {
    case 'RED': return 'bg-red-600 text-white';
    case 'ORANGE': return 'bg-orange-500 text-white';
    case 'YELLOW': return 'bg-yellow-500 text-black';
    case 'GREEN': return 'bg-green-600 text-white';
  }
}
