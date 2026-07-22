import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useTranslation } from '../i18n/useTranslation';
import { CONSENT_POLICY_VERSION } from '@drkyana/types';

// ---------------------------------------------------------------------------
// Generic legal page (/terms, /privacy, /support). Content lives ENTIRELY in
// the locale YAML as flat keys — legal.<page>.title / .intro / .sN.title /
// .sN.body — so the three languages stay in lockstep under scripts/locales.py
// and copy edits never touch code. Bodies support "\n\n" paragraph breaks and
// "• " bullet lines (parseYaml already decodes \n escapes).
//
// The version shown is CONSENT_POLICY_VERSION — the same constant recorded on
// every consent row — so what a patient reads here is provably what their
// consent record points at. Bump the constant when any legal wording changes.
// ---------------------------------------------------------------------------

export type LegalPageId = 'terms' | 'privacy' | 'support';

/** Upper bound on sections per page; iteration stops at the first gap. */
const MAX_SECTIONS = 12;

/** Render a body string: "\n\n" separates paragraphs; "• " lines form lists. */
function Body({ text }: { text: string }) {
  const blocks = text.split('\n\n').filter((b) => b.trim() !== '');
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        const isList = lines.every((l) => l.trim().startsWith('•'));
        if (isList) {
          return (
            <ul key={i} className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-muted md:text-base">
              {lines.map((l, j) => (
                <li key={j}>{l.trim().replace(/^•\s*/, '')}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="mt-3 text-sm leading-relaxed text-muted md:text-base">
            {block}
          </p>
        );
      })}
    </>
  );
}

export function LegalPage({ page }: { page: LegalPageId }) {
  const { t, lang } = useTranslation();
  const base = `legal.${page}`;

  const sections: { title: string; body: string }[] = [];
  for (let i = 1; i <= MAX_SECTIONS; i++) {
    const titleKey = `${base}.s${i}.title`;
    const title = t(titleKey);
    if (title === titleKey) break; // no such section — past the end
    sections.push({ title, body: t(`${base}.s${i}.body`, '') });
  }

  return (
    <>
      <Header />
      <main>
        <section className="py-16 md:py-24">
          <div className="container-page">
            <div className="mx-auto max-w-2xl">
              <span className="section-label">{t('legal.label', 'Legal')}</span>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink md:text-4xl">
                {t(`${base}.title`)}
              </h1>
              <p className="mt-2 text-xs text-muted">
                {t(page === 'privacy' ? 'legal.version_label' : 'legal.updated_label')}:{' '}
                {CONSENT_POLICY_VERSION}
              </p>
              {lang !== 'en' && (
                <p className="mt-2 text-xs italic text-muted">
                  {t('legal.translation_note')}
                </p>
              )}

              <Body text={t(`${base}.intro`, '')} />

              {sections.map((s, i) => (
                <section key={i} className="mt-8" aria-labelledby={`legal-s${i}`}>
                  <h2 id={`legal-s${i}`} className="text-lg font-semibold text-ink">
                    {s.title}
                  </h2>
                  <Body text={s.body} />
                </section>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
