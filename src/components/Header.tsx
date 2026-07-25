import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { LangSwitcher } from './LangSwitcher';
import { Link } from '../router';

// Section anchors are absolute (/#id) so they work from any page — <Link>
// navigates home then scrolls. /receptionist and /account are their own pages.
const NAV = [
  { href: '/#home', key: 'nav.home', en: 'Home' },
  { href: '/#about', key: 'nav.about', en: 'About' },
  { href: '/#services', key: 'nav.services', en: 'Services' },
  { href: '/receptionist', key: 'nav.receptionist', en: 'AI receptionist' },
  { href: '/#location', key: 'nav.practice', en: 'Practice' },
  { href: '/#contact', key: 'nav.contact', en: 'Contact' },
  { href: '/account', key: 'nav.account', en: 'My records' },
];

export function Header() {
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={[
        'sticky top-0 z-40 w-full transition-all duration-200 ease-spring',
        scrolled
          ? 'bg-white/90 shadow-sm shadow-ink/5 backdrop-blur-md'
          : 'bg-white/70 backdrop-blur-sm',
      ].join(' ')}
    >
      <div className="container-page flex h-16 items-center md:h-20">
        <Link to="/#home" className="text-xl font-bold tracking-tight text-brand md:text-2xl">
          {t('brand', 'Dr. Kyana')}
        </Link>

        <nav
          className={[
            'absolute inset-x-0 top-full overflow-hidden bg-white/95 shadow-md transition-[max-height] duration-300 ease-spring backdrop-blur-md md:static md:ml-auto md:flex md:max-h-none md:bg-transparent md:shadow-none md:backdrop-blur-none',
            navOpen ? 'max-h-96' : 'max-h-0 md:max-h-none',
          ].join(' ')}
          aria-label="Primary"
        >
          <ul className="flex flex-col gap-1 px-5 py-4 md:flex-row md:gap-7 md:p-0">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  to={item.href}
                  onClick={() => setNavOpen(false)}
                  className="block rounded-md px-2 py-2 text-sm font-medium text-ink transition-colors ease-spring hover:text-brand md:px-0 md:py-1"
                >
                  {t(item.key, item.en)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto md:ml-6">
          <LangSwitcher />
        </div>

        <button
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((v) => !v)}
          className="ml-2 inline-flex h-9 w-9 flex-col items-center justify-center gap-1.5 rounded-md text-brand transition-colors ease-spring hover:bg-brand/10 md:hidden"
        >
          <span className={`block h-0.5 w-5 rounded bg-current transition-transform ease-spring ${navOpen ? 'translate-y-2 rotate-45' : ''}`}></span>
          <span className={`block h-0.5 w-5 rounded bg-current transition-opacity ease-spring ${navOpen ? 'opacity-0' : ''}`}></span>
          <span className={`block h-0.5 w-5 rounded bg-current transition-transform ease-spring ${navOpen ? '-translate-y-2 -rotate-45' : ''}`}></span>
        </button>
      </div>
    </header>
  );
}
