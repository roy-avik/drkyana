import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { About } from './components/About';
import { Services } from './components/Services';
import { Location } from './components/Location';
import { QuickCheckCta } from './components/QuickCheckCta';
import { Contact } from './components/Contact';
import { Footer } from './components/Footer';
import { QuickCheckApp } from './routes/QuickCheckApp';
import { useHashRoute } from './router';

export function App() {
  const route = useHashRoute();

  if (route === '/quick-check') return <QuickCheckApp />;

  return (
    <>
      <Header />
      <main>
        <Hero />
        <About />
        <Services />
        <QuickCheckCta />
        <Location />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
