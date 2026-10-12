import { Clock, MapPin } from 'lucide-react';
import heroCup from '../assets/illustrations/hero-cup.svg';
import Ornament from './Ornament';

export default function HeroBanner() {
  return (
    <section id="hero" className="px-4 sm:px-10 pt-8 sm:pt-10">
      <div className="ornate-frame max-w-5xl mx-auto rounded-2xl bg-[#FBF6EA] px-6 sm:px-14 py-12 sm:py-16 text-center">
        <Ornament label="Books · Coffee · Community" />

        <h1
          className="text-4xl sm:text-6xl font-bold text-[#2E1F16] leading-tight mb-6"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          Выберите книгу.
          <br />
          Закажите кофе.
        </h1>

        <div className="w-40 h-40 sm:w-56 sm:h-56 mx-auto mb-6 rounded-full bg-[#F1E4C8] border border-[#E3D2A5] flex items-center justify-center p-6">
          <img src={heroCup} alt="Кофе и книги" className="w-full h-auto" />
        </div>

        <p
          className="text-lg sm:text-xl text-[#4A3A2C] mb-1"
          style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic' }}
        >
          Жүрөккө жылуулук берген даам ☕ Акылга жарык берген барак 📚
        </p>
        <p className="text-sm text-[#7A6A52] italic mb-8">
          «Вкус, что согревает сердце. Страница, что просвещает разум.»
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mb-9">
          <span className="inline-flex items-center gap-1.5 text-sm text-[#4A3A2C] border border-[#E3D2A5] rounded-full px-3.5 py-1.5">
            <MapPin size={14} className="text-[#B8934F]" /> Анкара 46, Бишкек
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm text-[#4A3A2C] border border-[#E3D2A5] rounded-full px-3.5 py-1.5">
            <Clock size={14} className="text-[#B8934F]" /> 9:00–22:00
          </span>
        </div>

        <a
          href="#menu"
          className="inline-flex items-center gap-2 bg-[#2E1F16] hover:bg-[#B8934F] transition-colors text-white font-semibold tracking-wide px-8 py-3 rounded-full"
        >
          Смотреть меню
        </a>
      </div>
    </section>
  );
}
