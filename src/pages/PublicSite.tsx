import BooksSection from '../components/BooksSection';
import DrinksSection from '../components/DrinksSection';
import ReviewsSection from '../components/ReviewsSection';
import AboutSection from '../components/AboutSection';
import CartPanel from '../components/CartPanel';
import ContactsSection from '../components/ContactsSection';
import HeroBanner from '../components/HeroBanner';
import MenuSection from '../components/MenuSection';
import Sidebar from '../components/Sidebar';
import { CartProvider } from '../context/CartContext';

export default function PublicSite() {
  return (
    <CartProvider>
      <div className="flex flex-col lg:flex-row min-h-screen bg-[#F1E4C8]">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col lg:flex-row">
          <main className="flex-1 min-w-0">
            <HeroBanner />
            <MenuSection />
            <DrinksSection />
            <BooksSection />
            <ReviewsSection />
            <AboutSection />
            <ContactsSection />
          </main>
          <CartPanel />
        </div>
      </div>
    </CartProvider>
  );
}
