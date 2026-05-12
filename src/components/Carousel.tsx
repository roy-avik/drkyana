import { useState, useEffect, useCallback, type ReactNode } from 'react';

interface CarouselProps {
  children: ReactNode[];
  interval?: number;
  dark?: boolean;
}

export function Carousel({ children, interval = 3500, dark = false }: CarouselProps) {
  const count = children.length;
  const [idx, setIdx] = useState(0);

  const next = useCallback(() => setIdx(i => (i + 1) % count), [count]);
  const prev = useCallback(() => setIdx(i => (i - 1 + count) % count), [count]);

  useEffect(() => {
    const id = setInterval(next, interval);
    return () => clearInterval(id);
  }, [next, interval]);

  const btnBase = 'absolute top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full shadow-md transition-colors z-10';
  const btnLight = 'bg-white text-brand ring-1 ring-ink/10 hover:bg-brand hover:text-white';
  const btnDark = 'bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20';

  return (
    <div className="relative mt-12">
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${idx * 100}%)` }}
        >
          {children.map((child, i) => (
            <div key={i} className="w-full flex-shrink-0">
              <div className="mx-auto max-w-lg px-10">
                {child}
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={prev}
        aria-label="Previous"
        className={`${btnBase} left-0 ${dark ? btnDark : btnLight}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      <button
        type="button"
        onClick={next}
        aria-label="Next"
        className={`${btnBase} right-0 ${dark ? btnDark : btnLight}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      <div className="mt-6 flex justify-center gap-2">
        {children.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIdx(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === idx
                ? dark ? 'w-6 bg-white' : 'w-6 bg-brand'
                : dark ? 'w-2 bg-white/30' : 'w-2 bg-brand/25'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
