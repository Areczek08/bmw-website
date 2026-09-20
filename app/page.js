"use client";

import { motion } from "framer-motion";
import { Truck, Wallet, FileText, Globe2, LogIn, UserPlus, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";

const features = [
  {
    icon: Wallet,
    title: "System Rozliczeń (Bank)",
    description: "Pełna automatyzacja Twoich zarobków. Odbieraj wypłaty za zlecenia, korzystaj z kasyna i przelewaj środki między kierowcami.",
  },
  {
    icon: Truck,
    title: "Zarządzanie Flotą",
    description: "Otrzymaj dedykowany zestaw z realistycznym systemem zużycia paliwa, uszkodzeń, czystości i konieczności przeglądów.",
  },
  {
    icon: FileText,
    title: "System Kadrowy i Wnioski",
    description: "Składaj wnioski urlopowe, zgłaszaj zapotrzebowanie na myjnię lub serwis. Zarząd i Dyspozytornia wszystko procesuje w BMS.",
  },
  {
    icon: Globe2,
    title: "Interaktywna Mapa",
    description: "Śledzenie położenia Twojego zestawu w czasie rzeczywistym i podgląd na żywo lokalizacji reszty ekipy Bojar Logistic na trasie.",
  },
];

export default function Home() {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated" && !!session?.user;

  return (
    <div className="flex flex-col items-center justify-center py-20 min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-3xl"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-sm font-medium mb-6 border border-zinc-300 dark:border-zinc-700">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          BMS SYSTEM 3.06.01 Online
        </div>
        
        <div className="flex justify-center mb-6">
          <img src="/logo-full-outline.png" alt="Bojar Manager System Logo" className="h-24 md:h-36 w-auto object-contain invert dark:invert-0" />
        </div>
        <h2 className="text-xl md:text-2xl font-semibold text-zinc-700 dark:text-zinc-300 mb-8">
          Bo liczy się jakość a nie ilość
        </h2>
        
        <p className="text-lg md:text-xl text-zinc-600 dark:text-zinc-400 mb-10 leading-relaxed max-w-4xl mx-auto">
          Nasz system BMS w wersji 3.06.01 umożliwia kompleksowe zarządzanie flotą: monitorowanie tras w czasie rzeczywistym, zarządzanie HR (kierowcami), integrację z flotą pojazdów i generowanie raportów efektywności.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          {isAuthenticated ? (
            <Link href="/dashboard">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg transition-all w-full sm:w-auto text-base"
              >
                <LayoutDashboard className="w-5 h-5" />
                Otwórz Pulpit BMS
              </motion.button>
            </Link>
          ) : (
            <>
              <Link href="/login">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 font-semibold shadow-lg transition-all w-full sm:w-auto text-base"
                >
                  <LogIn className="w-5 h-5" />
                  Zaloguj się
                </motion.button>
              </Link>
              <Link href="/register">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 font-semibold shadow-sm transition-all w-full sm:w-auto text-base"
                >
                  <UserPlus className="w-5 h-5" />
                  Zarejestruj się
                </motion.button>
              </Link>
            </>
          )}
          <a href="https://vsbojarlogistic.pl" target="_blank" rel="noopener noreferrer">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="px-8 py-3.5 rounded-xl bg-zinc-200 dark:bg-zinc-900 hover:bg-zinc-300 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-300 font-medium transition-all w-full sm:w-auto text-base border border-zinc-300 dark:border-zinc-800"
            >
              Strona Główna Firmy
            </motion.button>
          </a>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-32 w-full max-w-7xl px-4">
        {features.map((feature, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 + idx * 0.1 }}
            className="p-6 rounded-2xl bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-zinc-400 dark:hover:border-zinc-500 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-zinc-900 dark:group-hover:bg-zinc-100 transition-all duration-300">
              <feature.icon className="w-6 h-6 text-zinc-700 dark:text-zinc-300 group-hover:text-white dark:group-hover:text-zinc-900 transition-colors" />
            </div>
            <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed text-sm">
              {feature.description}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Stopka */}
      <footer className="mt-20 w-full text-center pb-4">
        <p className="text-zinc-500 text-sm font-medium">
          &copy; {new Date().getFullYear()} Bojar Logistic. Wszelkie prawa zastrzeżone. <br />
          <a href="https://vsbojarlogistic.pl" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-zinc-400 dark:hover:text-zinc-300 transition-colors mt-2 inline-block font-medium underline underline-offset-2">
            Przejdź do vsbojarlogistic.pl
          </a>
        </p>
      </footer>
    </div>
  );
}
