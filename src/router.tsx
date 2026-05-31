import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react';

// ---------------------------------------------------------------------------
// Minimal client-side router. The patient site is now multi-page (marketing /,
// /receptionist, /account) but stays a single Vite SPA — Cloudflare Pages serves
// index.html for every non-asset, non-Function path (see public/_redirects), and
// this router picks the view from window.location.pathname. No router dependency:
// the surface is just pushState + a popstate listener + a <Link> that intercepts
// plain left-clicks (modifier/middle clicks fall through so "open in new tab"
// still works).
// ---------------------------------------------------------------------------

type RouterValue = {
  /** Current pathname, e.g. "/", "/receptionist", "/account". */
  path: string;
  /** Navigate to an in-app path (optionally with a #hash to scroll to). */
  navigate: (to: string) => void;
};

const RouterContext = createContext<RouterValue | null>(null);

/** Scroll to a hash target if present, else to the top. */
function applyScroll(hash: string) {
  if (hash) {
    // Wait a frame so the destination page has rendered its anchor.
    requestAnimationFrame(() => {
      document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' });
    });
  } else {
    window.scrollTo({ top: 0 });
  }
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    const url = new URL(to, window.location.origin);
    const samePage = url.pathname === window.location.pathname;
    window.history.pushState({}, '', url);
    setPath(url.pathname);
    // Same-page hash links don't trigger a re-render that would scroll, so do it
    // here; cross-page navigation scrolls after the new page mounts.
    if (samePage) applyScroll(url.hash);
    else applyScroll(url.hash);
  }, []);

  return (
    <RouterContext.Provider value={{ path, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter(): RouterValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used inside <RouterProvider>');
  return ctx;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

/** Anchor that navigates client-side for plain left-clicks. */
export function Link({ to, onClick, children, ...rest }: LinkProps) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e);
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        ) {
          return; // let the browser handle new-tab / modified clicks
        }
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
