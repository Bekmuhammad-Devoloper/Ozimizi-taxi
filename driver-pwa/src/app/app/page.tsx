'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  Download,
  Bell,
  Navigation,
  ShieldCheck,
  Wallet,
  Gift,
  Zap,
  Smartphone,
  ChevronDown,
  Send,
  CheckCircle2,
  MapPin,
  ArrowRight,
  Receipt,
  MessageCircle,
  Users,
  Clock,
  Car,
  Apple,
  QrCode,
  Instagram,
  Star,
  Share,
} from 'lucide-react';
import { api } from '@/lib/api';
import { isNativeApp } from '@/lib/native';
import { apkDownloadUrl } from '@/lib/nav';

interface VersionInfo {
  version: string;
  builtAt: string;
  size: number;
  url: string;
}
interface PublicStats {
  rides: number;
  drivers: number;
  clients: number;
  adminContactUrl: string | null;
  instagram: string[];
}

const BOT_URL = 'https://t.me/Moviytaxibot';
const APK_FALLBACK = '/downloads/moviytaxi-driver.apk';
const n = (v: number) => v.toLocaleString('ru-RU').replace(/ /g, ' ');

/** Public landing: client bot + driver Android app. Route: /app */
export default function AppLandingPage() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [clientInfo, setClientInfo] = useState<VersionInfo | null>(null);
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [statsDone, setStatsDone] = useState(false);
  const [ios, setIos] = useState(false);
  // Inside the app the download links must open in the browser.
  const [native, setNative] = useState(false);

  useEffect(() => {
    fetch('/downloads/version.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setInfo)
      .catch(() => setInfo(null));
    fetch('/downloads/version-client.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setClientInfo)
      .catch(() => setClientInfo(null));
    api
      .get<PublicStats>('/public/stats')
      .then((r) => setStats(r.data))
      .catch(() => setStats(null))
      .finally(() => setStatsDone(true));
    setIos(/iPhone|iPad|iPod/i.test(navigator.userAgent));
    setNative(isNativeApp());
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => {
      document.documentElement.style.scrollBehavior = '';
    };
  }, []);

  const dl = (u: string) => (native ? apkDownloadUrl(u) : u);
  const href = dl(info?.url ?? APK_FALLBACK);
  const mb = info ? `${(info.size / 1024 / 1024).toFixed(1)} MB` : null;
  const version = info?.version ?? '1.0';
  const clientHref = dl(clientInfo?.url ?? '/downloads/moviytaxi-client.apk');
  const clientMb = clientInfo ? `${(clientInfo.size / 1024 / 1024).toFixed(1)} MB` : null;
  const clientVersion = clientInfo?.version ?? '1.0';
  const built = info ? new Date(info.builtAt).toLocaleDateString('uz-Latn-UZ', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return (
    <div className="min-h-[100dvh] bg-ink text-white overflow-x-hidden">
      {/* ---------- NAV ---------- */}
      <nav className="sticky top-0 z-40 bg-ink/80 backdrop-blur border-b border-white/10">
        <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between gap-3">
          <a href="#top" className="flex items-center gap-3 shrink-0">
            <span className="w-9 h-9 rounded-xl overflow-hidden ring-1 ring-gold/50">
              <Image src="/logo.jpg" alt="" width={36} height={36} className="w-full h-full object-cover" />
            </span>
            <span className="font-extrabold tracking-tight">
              MOVIY <span className="text-gold">TAXI</span>
            </span>
          </a>
          <div className="hidden md:flex items-center gap-1 text-sm text-neutral-300">
            <a href="#clients" className="px-3 py-2 rounded-lg hover:text-white hover:bg-white/5">Mijozlarga</a>
            <a href="#drivers" className="px-3 py-2 rounded-lg hover:text-white hover:bg-white/5">Haydovchilarga</a>
            <a href="#install" className="px-3 py-2 rounded-lg hover:text-white hover:bg-white/5">O‘rnatish</a>
            <a href="#faq" className="px-3 py-2 rounded-lg hover:text-white hover:bg-white/5">Savollar</a>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={BOT_URL}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex h-10 px-4 items-center gap-2 rounded-xl border border-white/15 text-sm font-semibold text-neutral-200 hover:bg-white/5"
            >
              <Send size={15} /> Taksi chaqirish
            </a>
            <a
              href={href}
              download
              className="inline-flex h-10 px-4 items-center gap-2 rounded-xl bg-gold text-ink text-sm font-bold hover:brightness-110 active:scale-[0.98]"
            >
              <Download size={15} /> APK
            </a>
          </div>
        </div>
      </nav>

      {/* ---------- HERO ---------- */}
      <header id="top" className="relative">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(60% 50% at 80% 10%, rgba(59,155,255,0.22), transparent 60%), radial-gradient(40% 40% at 10% 90%, rgba(59,155,255,0.10), transparent 60%)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(70% 60% at 50% 30%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(70% 60% at 50% 30%, black, transparent)',
          }}
        />

        <div className="relative mx-auto max-w-6xl px-5 pt-12 pb-16 md:pt-20 md:pb-24 grid md:grid-cols-2 gap-12 items-center">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-gold">
              <Star size={12} /> Moviy Taxi ilovalari
            </span>
            <h1 className="mt-5 text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
              Bir bosishda taksi.
              <br />
              <span className="text-gold">Haydovchilar uchun</span> rasmiy ilova.
            </h1>
            <p className="mt-5 text-base md:text-lg text-neutral-400 max-w-lg leading-relaxed">
              Mijozlar Telegram orqali chaqiradi — hech narsa o‘rnatish shart emas. Haydovchilar
              Android ilovada ishlaydi: buyurtma ovozi, fon GPS, balans va bonuslar.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row sm:flex-wrap gap-3">
              <a
                href={BOT_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-14 px-6 items-center justify-center gap-2.5 rounded-2xl bg-white text-ink text-base font-extrabold hover:bg-neutral-100 active:scale-[0.98] transition whitespace-nowrap"
              >
                <Send size={20} className="text-[#229ED9]" />
                Taksi chaqirish
                <span className="text-xs font-semibold text-neutral-500">· Telegram</span>
              </a>
              <a
                href={ios ? '/' : href}
                download={!ios}
                className="inline-flex h-14 px-6 items-center justify-center gap-2.5 rounded-2xl bg-gold text-ink text-base font-extrabold shadow-[0_12px_40px_-10px_rgba(59,155,255,0.6)] hover:brightness-110 active:scale-[0.98] transition whitespace-nowrap"
              >
                {ios ? <Apple size={20} /> : <Download size={20} />}
                {ios ? 'iPhone’da ochish' : 'Haydovchi ilovasi'}
                {!ios && mb && <span className="text-xs font-semibold text-ink/60">· APK {mb}</span>}
              </a>
            </div>

            <a
              href={clientHref}
              download
              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-neutral-300 hover:text-white"
            >
              <Smartphone size={15} className="text-gold" /> Mijoz ilovasi (Android APK{clientMb ? ` · ${clientMb}` : ''}) — xarita va jonli kuzatuv bilan
              <ArrowRight size={14} />
            </a>

            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-neutral-400">
              <li className="inline-flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-gold" /> Rasmiy imzolangan · v{version}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-gold" /> Android 7.0+ · iPhone (Safari)
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Zap size={14} className="text-gold" /> Bepul, reklamasiz
              </li>
            </ul>
          </div>

          <div className="animate-in fade-in zoom-in-95 duration-700 delay-150">
            <PhoneMockup />
          </div>
        </div>
      </header>

      {/* ---------- TRUST STRIP ---------- */}
      <section className="border-y border-white/10 bg-white/[0.03]">
        <div className="mx-auto max-w-6xl px-5 py-8 grid grid-cols-2 lg:grid-cols-5 gap-6">
          <Stat value={stats ? n(stats.rides) : statsDone ? '—' : '…'} label="bajarilgan safar" />
          <Stat value={stats ? n(stats.drivers) : statsDone ? '—' : '…'} label="tasdiqlangan haydovchi" />
          <Stat value={stats ? n(stats.clients) : statsDone ? '—' : '…'} label="mijoz botda" />
          <Stat value="100%" label="safarlar elektron chek bilan" />
          <Stat value="24/7" label="buyurtma qabul qilinadi" />
        </div>
      </section>

      {/* ---------- FOR CLIENTS ---------- */}
      <section id="clients" className="mx-auto max-w-6xl px-5 py-16 md:py-24 scroll-mt-20">
        <SectionTitle
          kicker="Mijozlar uchun"
          title="Telegram’da taksi chaqiring — 1 daqiqada haydovchi topiladi"
          text="Ilova o‘rnatish shart emas: @Moviytaxibot ochiladi, lokatsiya yuborasiz, mashina keladi. Haydovchi haqida hamma ma’lumot — rasm, raqam, telefon — botga keladi."
        />
        <div className="mt-10 grid lg:grid-cols-[1fr_1.1fr] gap-10 items-start">
          <BotMockup />
          <div>
            <ol className="space-y-3">
              <ClientStep n={1} title="Botni oching" text="@Moviytaxibot — “Start” bosing va telefon raqamingizni bir marta ulashing." />
              <ClientStep n={2} title="“Taxi chaqirish” → lokatsiya" text="Turgan joyingizni yuboring. Yaqin atrofdagi haydovchilar buyurtmani ko‘radi." />
              <ClientStep n={3} title="Haydovchi topildi" text="Mashina rasmi, davlat raqami, telefon va yetib kelish vaqti keladi. Kerak bo‘lsa haydovchiga shu chatda yozing." />
              <ClientStep n={4} title="Safar va chek" text="Narx masofa bo‘yicha, bonusdan qisman to‘lash mumkin. Yakunida QR kodli elektron chek keladi." />
            </ol>
            <div className="mt-6 grid sm:grid-cols-2 gap-3">
              <MiniFeature icon={<Gift size={16} />} title="Bonus va promo kod" text="Promo kod bonus balansga tushadi, do‘stingizni taklif qilsangiz ham bonus." />
              <MiniFeature icon={<Receipt size={16} />} title="Elektron chek" text="Har safardan keyin chek rasmi va QR — narx, masofa, kutish, bonus." />
              <MiniFeature icon={<MessageCircle size={16} />} title="Haydovchi bilan chat" text="Buyurtma faol paytda botga yozgan xabaringiz haydovchiga boradi." />
              <MiniFeature icon={<Clock size={16} />} title="Shaffof kutish narxi" text="Bepul daqiqalar, keyin har daqiqa uchun belgilangan narx — faqat mashina turganda." />
            </div>
            <div className="mt-6 rounded-3xl border border-gold/30 bg-gradient-to-b from-gold/15 to-transparent p-5">
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-2xl overflow-hidden ring-1 ring-gold/50 shrink-0">
                  <Image src="/logo.jpg" alt="" width={48} height={48} loading="eager" className="w-full h-full object-cover" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-extrabold leading-tight">Moviy Taxi — mijoz ilovasi</p>
                  <p className="text-xs text-neutral-400">
                    Android · v{clientVersion}
                    {clientMb && ` · ${clientMb}`} · xaritada chaqirish, haydovchini jonli kuzatish, chat, bonus, chek
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-col sm:flex-row gap-3">
                <a
                  href={clientHref}
                  download
                  className="flex-1 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gold text-ink font-extrabold hover:brightness-110 active:scale-[0.98]"
                >
                  <Download size={18} /> Mijoz ilovasini yuklab olish
                </a>
                <a
                  href="/client/"
                  className="flex-1 inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 text-sm font-semibold text-neutral-200 hover:bg-white/5"
                >
                  <Smartphone size={16} /> Brauzerda ochish (iPhone ham)
                </a>
              </div>
              <p className="mt-3 text-[11px] text-neutral-500">
                Kirish uchun botdagi telefon raqamingizni yozasiz — kod Telegram’ga keladi. Bot ishlashda davom etadi, ilova unga qo‘shimcha.
              </p>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <a
                href={BOT_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 px-5 items-center justify-center gap-2 rounded-xl bg-white text-ink font-extrabold hover:bg-neutral-100 w-full sm:w-auto"
              >
                <Send size={18} className="text-[#229ED9]" /> @Moviytaxibot
              </a>
              <div className="hidden sm:flex items-center gap-3 text-xs text-neutral-400">
                <span className="w-16 h-16 rounded-lg bg-white p-1 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/qr-bot.svg" alt="Telegram bot QR" width={64} height={64} className="w-full h-full" />
                </span>
                <span>
                  <QrCode size={14} className="inline mr-1 text-gold" />
                  Kompyuterdan ko‘ryapsizmi? QR kodni telefon kamerasi bilan skanerlang — bot ochiladi.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- FOR DRIVERS ---------- */}
      <section id="drivers" className="bg-white/[0.03] border-y border-white/10 scroll-mt-20">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <SectionTitle
            kicker="Haydovchilar uchun"
            title="Ishlash uchun kerak bo‘lgan hamma narsa — bitta ilovada"
            text="Saytdagi barcha funksiyalar + faqat ilovada ishlaydigan fon GPS va baland buyurtma ovozi. Yengil, reklamasiz, eski telefonlarda ham."
          />
          <div className="mt-10 grid lg:grid-cols-[1.4fr_1fr] gap-8 items-start">
            <div className="grid sm:grid-cols-2 gap-4">
              <Feature icon={<Bell size={20} />} title="Buyurtma ovozi" text="Yangi buyurtma alohida, baland signal va tebranish bilan keladi — telefon cho‘ntakda bo‘lsa ham." />
              <Feature icon={<Navigation size={20} />} title="Aniq km hisobi" text="GPS ekran o‘chiq va ilova fonda bo‘lganda ham ishlaydi. Masofa va narx kam chiqmaydi." />
              <Feature icon={<Clock size={20} />} title="Kutish hisoblagichi" text="Mijozni kutish va yo‘ldagi to‘xtashlar faqat mashina turganda hisoblanadi, haq avtomatik qo‘shiladi." />
              <Feature icon={<Wallet size={20} />} title="Balans va tarix" text="Sof daromad, komissiya va har bir safar hisobi. Kunlik, haftalik va oylik natijalar." />
              <Feature icon={<Gift size={20} />} title="Bonusni tasdiqlash" text="Mijoz bonusdan to‘lamoqchi bo‘lsa — bir tugma bilan tasdiqlaysiz, summa balansingizga tushadi." />
              <Feature icon={<MessageCircle size={20} />} title="Mijoz bilan chat" text="Safar davomida mijozga ilovadan yozasiz, javobi shu yerga keladi — qo‘ng‘iroq shart emas." />
            </div>
            <DownloadCard href={href} mb={mb} version={version} built={built} ios={ios} />
          </div>
        </div>
      </section>

      {/* ---------- INSTALL ---------- */}
      <section id="install" className="bg-white text-ink scroll-mt-20">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <SectionTitle
            dark={false}
            kicker="O‘rnatish"
            title="Android’da 4 qadamda tayyor"
            text="Google Play kerak emas — fayl shu sahifadan yuklanadi. iPhone’da esa sayt o‘zi ilova sifatida ishlaydi."
          />
          <ol className="mt-10 grid md:grid-cols-4 gap-4">
            <Step n={1} title="Yuklab oling" text="Kerakli ilova tugmasini bosing — haydovchi yoki mijoz. Fayl Yuklanmalar papkasiga tushadi." />
            <Step n={2} title="O‘rnating" text="Faylni oching. Telefon “noma’lum manbaga ruxsat” so‘rasa — ruxsat bering, bu bir martalik." />
            <Step n={3} title="Kiring" text="Telefon raqam va parol bilan kiring. Hisob bo‘lmasa — botdan ariza qoldiring, shartnomani tasdiqlang." />
            <Step n={4} title="Ruxsat bering" text="Joylashuv (“Har doim ruxsat”) va bildirishnomaga ruxsat bering. Batareya tejashni ilova uchun o‘chiring." />
          </ol>
          <div className="mt-8 rounded-2xl border border-line bg-paper p-5 flex flex-col sm:flex-row gap-4 sm:items-center">
            <span className="w-11 h-11 rounded-xl bg-ink text-white flex items-center justify-center shrink-0">
              <Apple size={22} />
            </span>
            <div className="text-sm text-neutral-700 leading-relaxed">
              <b className="text-ink">iPhone’da:</b> Safari’da <a href="/" className="font-semibold underline">{typeof window !== 'undefined' ? window.location.host : 'moviytaxi.uz'}</a> ni oching →{' '}
              <Share size={14} className="inline -mt-0.5" /> <b>Ulashish</b> → <b>“Bosh ekranga qo‘shish”</b>. Ilova ikonkasi bosh ekranda paydo bo‘ladi va to‘liq ekranda ishlaydi.
            </div>
          </div>
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
            <a
              href={href}
              download
              className="inline-flex h-14 px-6 items-center justify-center gap-2.5 rounded-2xl bg-ink text-gold text-base font-extrabold hover:opacity-90 active:scale-[0.98] w-full sm:w-auto"
            >
              <Download size={20} /> APK yuklab olish
            </a>
            <p className="text-xs text-neutral-500">
              Versiya {version}
              {built && ` · ${built}`} · Yangilanish ham shu sahifadan — eski versiya ustiga o‘rnatiladi, ma’lumotlar saqlanadi.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="mx-auto max-w-3xl px-5 py-16 md:py-24 scroll-mt-20">
        <SectionTitle kicker="Savol-javob" title="Ko‘p so‘raladigan savollar" />
        <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
          <Faq q="Mijoz sifatida qanday to‘layman?">
            Safar yakunida narx botga keladi: naqd yoki karta orqali haydovchiga to‘laysiz. Bonus balansingiz bo‘lsa, “Bonusdan to‘lash” tugmasi bilan bir qismini bonusdan to‘lashingiz mumkin — haydovchi tasdiqlaydi.
          </Faq>
          <Faq q="Mijoz ilovasi botdan nimasi bilan farq qiladi?">
            Ilovada xaritada aniq joyni belgilaysiz, mashinaning kelishini jonli ko‘rasiz, haydovchi bilan chat, bonus va cheklar bir joyda. Bot esa Telegram ichida, o‘rnatishsiz ishlaydi — ikkalasi bitta hisob.
          </Faq>
          <Faq q="Chek qayerda ko‘rinadi?">
            Har safardan keyin botga chek rasmi keladi: raqam, sana, haydovchi, mashina, yo‘nalish, masofa, kutish, jami. Chekdagi QR kod saytdagi tekshirish sahifasini ochadi.
          </Faq>
          <Faq q="Kutish vaqti qanday hisoblanadi?">
            Haydovchi “Yetib keldim”ni bosgandan boshlab bepul daqiqalar ketadi, keyin har daqiqa uchun belgilangan narx. Faqat mashina turgan vaqt hisoblanadi — harakat vaqti qo‘shilmaydi.
          </Faq>
          <Faq q="Nega haydovchi ilovasi Google Play’da yo‘q?">
            Ilova haydovchilarimiz uchun to‘g‘ridan-to‘g‘ri tarqatiladi. Fayl Moviy Taxi kaliti bilan imzolangan — faqat shu sahifadan yuklab oling.
          </Faq>
          <Faq q="Telefon “xavfli fayl” deb ogohlantiryapti">
            Bu Play’dan tashqari o‘rnatiladigan barcha ilovalarda chiqadigan standart ogohlantirish. “Baribir o‘rnatish”ni bosing.
          </Faq>
          <Faq q="Fonda GPS batareyani ko‘p sarflaydimi?">
            GPS faqat siz ONLINE bo‘lganingizda yoki safar davomida ishlaydi. Offline holatda ilova hech narsa kuzatmaydi.
          </Faq>
          <Faq q="Buyurtma ovozi kelmayapti">
            Sozlamalar → Ilovalar → Moviy Taxi → Bildirishnomalar’da “Yangi buyurtmalar” kanali yoqilganini va telefon “Bezovta qilmaslik” rejimida emasligini tekshiring.
          </Faq>
          <Faq q="Yangilanish qanday bo‘ladi?">
            Yangi versiya chiqqanda shu sahifadan qayta yuklab oling va o‘rnating — ma’lumotlaringiz saqlanib qoladi. iPhone’da sayt o‘zi yangilanadi.
          </Faq>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="relative overflow-hidden rounded-3xl bg-gold text-ink p-8 md:p-12">
          <div aria-hidden className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-white/30 blur-3xl" />
          <div className="relative grid md:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <h3 className="text-2xl md:text-3xl font-extrabold tracking-tight">Hali haydovchi emasmisiz?</h3>
              <p className="mt-2 text-ink/70 max-w-xl">
                Telegram botda “Haydovchi bo‘lish” tugmasini bosing, 2 daqiqada ariza to‘ldiring va shartnomani tasdiqlang — admin ko‘rib chiqqach login va parol shu botga keladi.
              </p>
            </div>
            <a
              href={BOT_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-14 px-6 items-center justify-center gap-2 rounded-2xl bg-ink text-gold font-extrabold hover:opacity-90 active:scale-[0.98]"
            >
              <Send size={18} /> @Moviytaxibot
            </a>
          </div>
        </div>
      </section>

      {/* ---------- FOOTER ---------- */}
      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <span>© {new Date().getFullYear()} Moviy Taxi · Tez · Qulay · Ishonchli</span>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <a href="/" className="hover:text-white">Haydovchi sayti</a>
            <a href={BOT_URL} target="_blank" rel="noreferrer" className="hover:text-white inline-flex items-center gap-1">
              <Send size={12} /> Telegram bot
            </a>
            {stats?.adminContactUrl && (
              <a href={stats.adminContactUrl} target="_blank" rel="noreferrer" className="hover:text-white inline-flex items-center gap-1">
                <Users size={12} /> Admin bilan aloqa
              </a>
            )}
            {stats?.instagram?.map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className="hover:text-white inline-flex items-center gap-1">
                <Instagram size={12} /> Instagram
              </a>
            ))}
          </div>
        </div>
      </footer>

      {/* ---------- STICKY MOBILE CTA ---------- */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 p-3 bg-ink/85 backdrop-blur border-t border-white/10 grid grid-cols-2 gap-2">
        <a
          href={BOT_URL}
          target="_blank"
          rel="noreferrer"
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-white text-ink font-extrabold text-sm"
        >
          <Send size={16} className="text-[#229ED9]" /> Taksi chaqirish
        </a>
        <a
          href={ios ? '/' : href}
          download={!ios}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-gold text-ink font-extrabold text-sm"
        >
          {ios ? <Apple size={16} /> : <Download size={16} />} {ios ? 'iPhone’da ochish' : 'APK yuklab olish'}
        </a>
      </div>
      <div className="md:hidden h-20" aria-hidden />
    </div>
  );
}

/* ---------- pieces ---------- */

function DownloadCard({
  href,
  mb,
  version,
  built,
  ios,
}: {
  href: string;
  mb: string | null;
  version: string;
  built: string | null;
  ios: boolean;
}) {
  return (
    <div className="rounded-3xl border border-gold/30 bg-gradient-to-b from-gold/15 to-transparent p-6 lg:sticky lg:top-24">
      <div className="flex items-center gap-3">
        <span className="w-14 h-14 rounded-2xl overflow-hidden ring-1 ring-gold/50 shrink-0">
          <Image src="/logo.jpg" alt="" width={56} height={56} loading="eager" className="w-full h-full object-cover" />
        </span>
        <div>
          <p className="font-extrabold text-lg leading-tight">Moviy Taxi Driver</p>
          <p className="text-xs text-neutral-400">
            Android · v{version}
            {mb && ` · ${mb}`}
          </p>
        </div>
      </div>
      <ul className="mt-5 space-y-2 text-sm text-neutral-300">
        {[
          'Rasmiy imzolangan APK, Play kerak emas',
          'Android 7.0 va undan yuqori',
          'Yangilanish shu sahifadan, ma’lumotlar saqlanadi',
        ].map((t) => (
          <li key={t} className="flex items-start gap-2">
            <CheckCircle2 size={16} className="text-gold mt-0.5 shrink-0" /> {t}
          </li>
        ))}
      </ul>
      <a
        href={href}
        download
        className="mt-6 flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-gold text-ink text-base font-extrabold shadow-[0_12px_40px_-10px_rgba(59,155,255,0.6)] hover:brightness-110 active:scale-[0.98] transition"
      >
        <Download size={20} /> APK yuklab olish
      </a>
      {built && <p className="mt-2 text-center text-[11px] text-neutral-500">So‘nggi yangilanish: {built}</p>}
      <div className={'mt-5 rounded-2xl border p-4 text-sm ' + (ios ? 'border-gold/50 bg-gold/10' : 'border-white/10 bg-white/[0.03]')}>
        <p className="font-bold flex items-center gap-2">
          <Apple size={16} /> iPhone’dami?
        </p>
        <p className="mt-1 text-neutral-400 text-[13px] leading-relaxed">
          Safari’da <a href="/" className="text-white underline">saytni oching</a> → Ulashish → “Bosh ekranga qo‘shish”. Ilova sifatida ishlaydi, APK kerak emas.
        </p>
      </div>
      <p className="mt-4 text-[11px] text-neutral-500 flex items-center gap-1.5">
        <Smartphone size={12} /> Hisob yo‘qmi? Botda “Haydovchi bo‘lish” → ariza → admin tasdig‘i.
      </p>
    </div>
  );
}

function BotMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[360px]">
      <div aria-hidden className="absolute -inset-6 rounded-[3rem] bg-[#229ED9]/15 blur-3xl" />
      <div className="relative rounded-[2.2rem] border border-white/10 bg-[#0e1621] shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 h-14 bg-[#17212b] border-b border-white/5">
          <span className="w-9 h-9 rounded-full overflow-hidden ring-1 ring-gold/40">
            <Image src="/logo.jpg" alt="" width={36} height={36} className="w-full h-full object-cover" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold">Moviy Taxi</p>
            <p className="text-[11px] text-[#229ED9]">bot</p>
          </div>
        </div>
        <div className="p-3 space-y-2.5 text-[12.5px] leading-snug">
          <Bubble me>📍 Lokatsiya yuborildi</Bubble>
          <Bubble>
            🔎 <b>Haydovchi qidirilmoqda…</b>
            <br />
            <span className="text-neutral-400">Yaqin atrofdagi haydovchilarga yuborildi</span>
          </Bubble>
          <Bubble>
            ✅ <b>Haydovchi topildi!</b>
            <div className="mt-1.5 rounded-xl overflow-hidden border border-white/10">
              <div className="h-16 bg-gradient-to-br from-neutral-700 to-neutral-900 flex items-center justify-center text-neutral-400">
                <Car size={26} />
              </div>
              <div className="p-2 text-[11.5px] space-y-0.5 bg-[#182533]">
                <p>👤 Akmal K. · ⭐ 4.9</p>
                <p>
                  🚗 Chevrolet Cobalt, oq · <span className="font-mono bg-white/10 px-1 rounded">01 A 777 BC</span>
                </p>
                <p className="text-neutral-400">⏱ Taxminan 4 daqiqada yetib keladi</p>
              </div>
            </div>
          </Bubble>
          <Bubble>
            🏁 <b>Safar yakunlandi</b>
            <br />
            📏 6.4 km · ⏱ 18 daqiqa
            <br />
            💰 Narx: <b>18 000 so‘m</b>
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1 text-[11px]">
              <Receipt size={12} className="text-gold" /> Chek № 1041 · QR
            </div>
          </Bubble>
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            {['🚕 Taxi chaqirish', '🎟 Promo kod', '💰 Bonus', '📦 Buyurtmalarim'].map((b) => (
              <span key={b} className="h-8 rounded-lg bg-[#2b5278] text-[11px] font-semibold flex items-center justify-center">
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ children, me }: { children: React.ReactNode; me?: boolean }) {
  return (
    <div className={'flex ' + (me ? 'justify-end' : 'justify-start')}>
      <div className={'max-w-[88%] rounded-2xl px-3 py-2 ' + (me ? 'bg-[#2b5278] rounded-br-md' : 'bg-[#182533] rounded-bl-md')}>
        {children}
      </div>
    </div>
  );
}

function ClientStep({ n: num, title, text }: { n: number; title: string; text: string }) {
  return (
    <li className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <span className="w-9 h-9 rounded-xl bg-gold text-ink font-extrabold flex items-center justify-center text-sm shrink-0">{num}</span>
      <div>
        <h3 className="font-bold">{title}</h3>
        <p className="mt-1 text-sm text-neutral-400 leading-relaxed">{text}</p>
      </div>
    </li>
  );
}

function MiniFeature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 p-4">
      <p className="font-bold text-sm flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-gold/15 text-gold flex items-center justify-center">{icon}</span>
        {title}
      </p>
      <p className="mt-1.5 text-[13px] text-neutral-400 leading-relaxed">{text}</p>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[320px] md:max-w-[340px]">
      <div aria-hidden className="absolute -inset-6 rounded-[3rem] bg-gold/20 blur-3xl" />
      <div className="absolute -top-5 -left-4 sm:-left-10 z-20 w-[260px] rounded-2xl bg-white text-ink shadow-2xl p-3 flex gap-3 animate-in fade-in slide-in-from-top-2 duration-700">
        <span className="w-9 h-9 rounded-xl bg-gold text-ink flex items-center justify-center shrink-0">
          <Bell size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-bold leading-tight">🚕 Yangi buyurtma!</p>
          <p className="text-[11px] text-neutral-500 mt-0.5">1.2 km uzoqlikda · 15 soniya ichida qabul qiling</p>
        </div>
      </div>

      <div className="relative rounded-[2.6rem] border-[6px] border-neutral-800 bg-neutral-950 shadow-2xl overflow-hidden aspect-[9/19]">
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-5 rounded-full bg-neutral-800" />
        <div className="h-full bg-paper text-ink flex flex-col pt-8">
          <div className="mx-3 rounded-2xl bg-ink text-white p-4">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg overflow-hidden ring-1 ring-gold/50">
                <Image src="/logo.jpg" alt="" width={28} height={28} className="w-full h-full object-cover" />
              </span>
              <div className="leading-tight">
                <p className="text-[8px] tracking-widest text-neutral-400">MOVIY TAXI</p>
                <p className="text-[11px] font-semibold">Shokirjonov B.</p>
              </div>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <p className="text-[8px] uppercase tracking-wider text-neutral-400">Balans</p>
                <p className="text-xl font-extrabold tabular-nums leading-none mt-0.5">
                  128 000 <span className="text-[9px] font-normal text-neutral-400">so‘m</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-bold text-gold uppercase">Online</p>
                <span className="inline-block mt-1 w-10 h-5 rounded-full bg-gold relative">
                  <span className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-white" />
                </span>
              </div>
            </div>
          </div>
          <div className="mx-3 mt-3 grid grid-cols-3 gap-1.5">
            {[
              ['Daromad', '94 000'],
              ['Buyurtma', '12'],
              ['Masofa', '86.4 km'],
            ].map(([l, v]) => (
              <div key={l} className="bg-white border border-line rounded-xl p-2">
                <p className="text-[7px] uppercase tracking-wider text-neutral-500 font-bold">{l}</p>
                <p className="text-[11px] font-extrabold tabular-nums mt-0.5">{v}</p>
              </div>
            ))}
          </div>
          <div className="mx-3 mt-3 rounded-2xl bg-white border-2 border-gold p-3 shadow-lg">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-bold uppercase tracking-wider text-gold-deep">Yangi buyurtma</p>
              <span className="text-[9px] font-bold tabular-nums bg-ink text-gold rounded-full px-1.5 py-0.5">12 s</span>
            </div>
            <p className="mt-1.5 text-[11px] font-semibold flex items-center gap-1">
              <MapPin size={11} className="text-gold-deep" /> Chilonzor, 20-kvartal
            </p>
            <p className="text-[9px] text-neutral-500">Sizdan 1.2 km</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <span className="h-7 rounded-lg bg-neutral-100 text-[10px] font-bold flex items-center justify-center">Rad</span>
              <span className="h-7 rounded-lg bg-gold text-ink text-[10px] font-extrabold flex items-center justify-center">Qabul qilish</span>
            </div>
          </div>
          <div className="mx-3 mt-3">
            <p className="text-[8px] uppercase tracking-wider text-neutral-500 font-bold">So‘nggi buyurtmalar</p>
            {[
              ['Yunusobod → Chorsu', '14 000'],
              ['Sergeli → Oybek', '22 000'],
              ['Beruniy → Minor', '9 000'],
            ].map(([r, pr]) => (
              <div key={r} className="mt-1.5 bg-white border border-line rounded-xl px-2.5 py-2 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold truncate">{r}</p>
                  <p className="text-[8px] text-emerald-700 font-bold uppercase">Bajarildi</p>
                </div>
                <p className="text-[10px] font-extrabold tabular-nums">
                  {pr} <span className="text-[7px] font-normal text-neutral-500">so‘m</span>
                </p>
              </div>
            ))}
          </div>
          <div className="mt-auto mx-3 mb-3 h-10 rounded-full bg-ink flex items-center justify-around text-[8px] text-neutral-400">
            <span className="text-gold font-bold">Asosiy</span>
            <span>Buyurtma</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-3xl font-extrabold tabular-nums text-gold whitespace-nowrap">{value}</p>
      <p className="mt-1 text-xs text-neutral-400 leading-snug">{label}</p>
    </div>
  );
}

function SectionTitle({ kicker, title, text, dark = true }: { kicker: string; title: string; text?: string; dark?: boolean }) {
  return (
    <div className="max-w-2xl">
      <p className="text-[11px] font-bold uppercase tracking-widest text-gold">{kicker}</p>
      <h2 className={'mt-2 text-3xl md:text-4xl font-extrabold tracking-tight ' + (dark ? 'text-white' : 'text-ink')}>{title}</h2>
      {text && <p className={'mt-3 text-base leading-relaxed ' + (dark ? 'text-neutral-400' : 'text-neutral-600')}>{text}</p>}
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="group rounded-2xl border border-white/10 bg-ink/40 p-5 hover:border-gold/40 hover:bg-white/[0.05] transition">
      <span className="w-11 h-11 rounded-xl bg-gold/15 text-gold flex items-center justify-center">{icon}</span>
      <h3 className="mt-4 font-bold text-base">{title}</h3>
      <p className="mt-1.5 text-sm text-neutral-400 leading-relaxed">{text}</p>
    </div>
  );
}

function Step({ n: num, title, text }: { n: number; title: string; text: string }) {
  return (
    <li className="relative rounded-2xl border border-line bg-paper p-5">
      <span className="w-9 h-9 rounded-xl bg-ink text-gold font-extrabold flex items-center justify-center text-sm">{num}</span>
      <h3 className="mt-4 font-bold">{title}</h3>
      <p className="mt-1.5 text-sm text-neutral-600 leading-relaxed">{text}</p>
    </li>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group py-4">
      <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-semibold">
        {q}
        <ChevronDown size={18} className="shrink-0 text-neutral-500 transition group-open:rotate-180" />
      </summary>
      <p className="mt-3 text-sm text-neutral-400 leading-relaxed">{children}</p>
    </details>
  );
}
