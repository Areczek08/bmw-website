"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { KeyRound, Mail, ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("registered") === "true") {
        setIsRegistered(true);
      }
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const cleanEmail = email.trim().toLowerCase();
      const res = await signIn("credentials", {
        email: cleanEmail,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("Nieprawidłowy adres e-mail lub hasło.");
        setLoading(false);
      } else if (res?.ok) {
        const params = new URLSearchParams(window.location.search);
        const callbackUrl = params.get("callbackUrl") || "/dashboard";
        window.location.href = callbackUrl;
      } else {
        setError("Nieprawidłowy adres e-mail lub hasło.");
        setLoading(false);
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Nieprawidłowy adres e-mail lub hasło.");
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center py-16 px-4 min-h-[85vh] relative overflow-hidden">
      {/* Ambient background glow - pure white/gray tone */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-zinc-500/10 blur-[130px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 25, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800/80 rounded-3xl shadow-2xl backdrop-blur-xl relative z-10 overflow-hidden"
      >
        {/* Subtle top accent border */}
        <div className="h-1 w-full bg-gradient-to-r from-zinc-700 via-zinc-400 to-zinc-700" />

        <div className="p-8 md:p-10">
          {/* Logo & Header */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-center p-3 shadow-inner mb-4">
              <img src="/logo-icon-outline.png" alt="BMS Logo" className="w-9 h-9 object-contain invert dark:invert-0" />
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">Witaj ponownie</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 font-normal">
              Zaloguj się do panelu Bojar Manager System
            </p>
          </div>

          {isRegistered && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs md:text-sm text-center font-medium shadow-sm flex items-center justify-center gap-2.5"
            >
              <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-400" />
              <span>Konto zostało zarejestrowane! Zaloguj się poniżej. Pamiętaj, że pełny dostęp do systemu odblokuje się po potwierdzeniu przez Zarząd.</span>
            </motion.div>
          )}

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 text-sm text-center font-medium shadow-sm flex items-center justify-center gap-2"
            >
              <div className="w-2 h-2 rounded-full bg-zinc-900 dark:bg-white shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Adres e-mail</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-zinc-400" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950/80 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-zinc-900 dark:focus:border-white focus:ring-1 focus:ring-zinc-900 dark:focus:ring-white/20 outline-none transition-all text-sm"
                  placeholder="np. kierowca@firma.pl"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Hasło</label>
                <Link href="/forgot-password" className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors underline-offset-4 hover:underline">
                  Zapomniałeś hasła?
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <KeyRound className="h-4 w-4 text-zinc-400" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950/80 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-zinc-900 dark:focus:border-white focus:ring-1 focus:ring-zinc-900 dark:focus:ring-white/20 outline-none transition-all text-sm"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 mt-2 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-950 rounded-xl font-bold transition-all focus:ring-2 focus:ring-zinc-500 disabled:opacity-60 flex justify-center items-center gap-2 active:scale-[0.98] shadow-lg text-sm"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <>
                  Zaloguj się <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800/60 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Nie masz jeszcze konta?{" "}
            <Link href="/register" className="text-zinc-900 dark:text-white font-bold hover:underline ml-1">
              Zarejestruj się
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
