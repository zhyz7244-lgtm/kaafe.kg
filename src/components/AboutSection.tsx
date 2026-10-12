import { BookOpen, Coffee, Users } from 'lucide-react';
import Ornament from './Ornament';

const POINTS = [
  {
    icon: Coffee,
    title: 'Кофе',
    text: 'Свежая обжарка и классическая кофейная карта — от эспрессо до рафа.',
  },
  {
    icon: BookOpen,
    title: 'Книги',
    text: 'Книжный уголок: выбирайте книгу с полки и читайте за чашкой кофе.',
  },
  {
    icon: Users,
    title: 'Сообщество',
    text: 'Уютное место для встреч, учёбы и разговоров — атмосфера прежде всего.',
  },
];

export default function AboutSection() {
  return (
    <section id="about" className="px-4 sm:px-10 py-12 max-w-5xl mx-auto text-center">
      <Ornament label="О нас" />
      <h2
        className="text-3xl sm:text-4xl font-bold text-[#2E1F16] mb-10"
        style={{ fontFamily: "'Playfair Display', serif" }}
      >
        О нас
      </h2>
      <div className="grid sm:grid-cols-3 gap-5">
        {POINTS.map((point) => {
          const Icon = point.icon;
          return (
            <div
              key={point.title}
              className="bg-[#FBF6EA] rounded-2xl border border-[#E3D2A5] p-6"
            >
              <div className="w-12 h-12 rounded-full bg-[#F1E4C8] text-[#B8934F] flex items-center justify-center mb-4 mx-auto">
                <Icon size={22} strokeWidth={1.75} />
              </div>
              <h3
                className="font-bold text-[#2E1F16] mb-1.5"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {point.title}
              </h3>
              <p className="text-sm text-[#6B5A4A] leading-relaxed">{point.text}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
