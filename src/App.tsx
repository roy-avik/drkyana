import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { About } from './components/About';
import { Services } from './components/Services';
import { Location } from './components/Location';
import { Receptionist } from './components/Receptionist';
import { Contact } from './components/Contact';
import { Footer } from './components/Footer';

export function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <About />
        <Services />
        <Receptionist />
        <Location />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
