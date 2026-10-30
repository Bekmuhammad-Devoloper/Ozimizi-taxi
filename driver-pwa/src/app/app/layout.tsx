import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Moviy Taxi — ilovalar: mijozlar uchun Telegram bot, haydovchilar uchun Android ilova',
  description:
    'Moviy Taxi: Telegram orqali taksi chaqiring, bonus va promo kodlardan foydalaning, har safardan keyin elektron chek oling. Haydovchilar uchun rasmiy Android ilova — fon GPS, buyurtma ovozi, balans.',
  openGraph: {
    title: 'Moviy Taxi — ilovalar',
    description: 'Mijozlar uchun Telegram bot · Haydovchilar uchun Android ilova',
    images: ['/logo.jpg'],
    type: 'website',
    locale: 'uz_UZ',
  },
  alternates: { canonical: '/app' },
};

export default function AppLandingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
