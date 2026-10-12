import { Clock, MapPin } from 'lucide-react';
import InstagramIcon from './icons/InstagramIcon';

export default function ContactsSection() {
  return (
    <section id="contacts" className="px-4 sm:px-10 py-12 pb-16 max-w-5xl mx-auto">
      <div className="bg-[#2E1F16] rounded-3xl border border-[#B8934F]/40 px-6 sm:px-10 py-10 sm:py-12 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-8">
        <div>
          <p className="ornament-divider text-xs font-semibold uppercase tracking-[0.3em] text-[#C9A768] mb-3 justify-start">
            Контакты
          </p>
          <h2
            className="text-2xl sm:text-3xl font-bold mb-4"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Будем рады видеть вас
          </h2>
          <div className="flex flex-col gap-2.5 text-white/80 text-sm">
            <span className="flex items-center gap-2">
              <MapPin size={16} className="text-[#C9A768]" /> ул. Анкара 46, Бишкек
            </span>
            <span className="flex items-center gap-2">
              <Clock size={16} className="text-[#C9A768]" /> Ежедневно, 9:00–22:00
            </span>
          </div>
        </div>

        <a
          href="https://www.instagram.com/kaafi_kg"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 bg-[#B8934F] text-[#2E1F16] font-semibold px-6 py-3 rounded-full hover:bg-[#C9A768] transition-colors w-fit"
        >
          <InstagramIcon size={18} />
          @kaafi_kg
        </a>
      </div>
    </section>
  );
}
