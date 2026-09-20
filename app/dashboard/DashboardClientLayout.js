"use client";

import { Sidebar } from "../components/Sidebar";
import { WelcomeModal } from "../components/WelcomeModal";
import { useSession, signOut } from "next-auth/react";
import { Clock, LogOut, ShieldAlert, AlertCircle, RefreshCw, User, Mail, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardClientLayout({ children }) {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    let interval;
    const user = session?.user;
    const isBoard = user?.role === "BOARD" || user?.role === "OWNER";
    const isPending = user?.driverStatus === "WAITING_FOR_APPROVAL";

    if (!isBoard && isPending) {
      // Periodic check every 5s so when the Board approves, it auto-unlocks
      interval = setInterval(() => {
        update();
      }, 5000);
    } else if (user?.id) {
      fetch('/api/user/heartbeat', { method: 'PUT' }).catch(e => console.error(e));
      interval = setInterval(() => {
        fetch('/api/user/heartbeat', { method: 'PUT' }).catch(e => console.error(e));
      }, 60000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [session?.user?.driverStatus, update, session?.user?.id, session?.user?.role]);

  // 1. Ładowanie sesji
  if (status === "loading") {
    return (
      <div className="flex flex-col h-[75vh] items-center justify-center gap-4">
        <div className="w-10 h-10 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-sm font-medium text-zinc-400">Weryfikacja uprawnień...</p>
      </div>
    );
  }

  // 2. Brak sesji (niezalogowany) -> natychmiastowe przekierowanie
  if (status === "unauthenticated" || !session?.user) {
    return (
      <div className="flex flex-col h-[75vh] items-center justify-center gap-4">
        <div className="w-10 h-10 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-sm font-medium text-zinc-400">Wymagane logowanie. Przekierowywanie...</p>
      </div>
    );
  }

  const user = session.user;
  const isBoard = user.role === "BOARD" || user.role === "OWNER";
  const isWaitingApproval = user.driverStatus === "WAITING_FOR_APPROVAL" || !user.driverStatus;
  const isInactive = user.driverStatus === "INACTIVE";
  const isSuspended = user.driverStatus === "SUSPENDED";

  // 3. Konto oczekujące na zatwierdzenie przez Zarząd
  if (!isBoard && isWaitingApproval) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] text-center px-4 py-12">
        <div className="w-full max-w-lg bg-zinc-900/90 border border-zinc-800 rounded-3xl p-8 md:p-10 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="h-1.5 w-full bg-amber-500/80 absolute top-0 left-0" />
          
          <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
            <Clock className="w-10 h-10 animate-pulse" />
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-4">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            Weryfikacja w toku
          </div>

          <h1 className="text-2xl md:text-3xl font-black text-white mb-3 tracking-tight">
            Konto oczekuje na potwierdzenie
          </h1>
          
          <p className="text-zinc-400 text-sm md:text-base leading-relaxed mb-6">
            Twoje konto w <strong className="text-zinc-200 font-semibold">Bojar Manager System</strong> zostało pomyślnie zarejestrowane. Zanim uzyskasz dostęp do dyspozytorni, tras, floty oraz banku, Twoje zgłoszenie musi zostać <strong className="text-white">zaakceptowane przez Zarząd</strong>.
          </p>

          <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-4 mb-6 text-left space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500 flex items-center gap-1.5">
                <User size={14} className="text-zinc-400" /> Użytkownik:
              </span>
              <span className="font-semibold text-zinc-200">{user.name || user.firstName || "Kierowca"}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500 flex items-center gap-1.5">
                <Mail size={14} className="text-zinc-400" /> Email:
              </span>
              <span className="font-semibold text-zinc-200">{user.email}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-amber-400" /> Status rekrutacji:
              </span>
              <span className="font-bold text-amber-400">Oczekuje na decyzję Zarządu</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 mb-8">
            <RefreshCw size={12} className="animate-spin text-zinc-400" />
            <span>Sprawdzanie statusu na żywo (automatyczne odblokowanie)</span>
          </div>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-semibold text-sm transition-all border border-zinc-700"
          >
            <LogOut className="w-4 h-4" />
            Wyloguj się
          </button>
        </div>
      </div>
    );
  }

  // 4. Konto odrzucone przez Zarząd
  if (!isBoard && isInactive) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] text-center px-4 py-12">
        <div className="w-full max-w-lg bg-zinc-900/90 border border-red-500/20 rounded-3xl p-8 md:p-10 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="h-1.5 w-full bg-red-500 absolute top-0 left-0" />
          <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white mb-3">Zgłoszenie niezaakceptowane</h1>
          <p className="text-zinc-400 text-sm leading-relaxed mb-6">
            Zarząd firmy podjął decyzję o niezaakceptowaniu Twojego podania rejestracyjnego lub Twoje konto zostało dezaktywowane. W razie pytań skontaktuj się z administracją.
          </p>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium text-sm transition-colors mx-auto"
          >
            <LogOut className="w-4 h-4" />
            Wyloguj się
          </button>
        </div>
      </div>
    );
  }

  // 5. Konto zawieszone
  if (!isBoard && isSuspended) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] text-center px-4 py-12">
        <div className="w-full max-w-lg bg-zinc-900/90 border border-orange-500/20 rounded-3xl p-8 md:p-10 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="h-1.5 w-full bg-orange-500 absolute top-0 left-0" />
          <div className="w-20 h-20 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-10 h-10" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white mb-3">Konto zostało zawieszone</h1>
          <p className="text-zinc-400 text-sm leading-relaxed mb-6">
            Twój dostęp do systemu BMS został tymczasowo zawieszony przez Zarząd. Skontaktuj się z dyspozytornią lub administracją firmy.
          </p>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium text-sm transition-colors mx-auto"
          >
            <LogOut className="w-4 h-4" />
            Wyloguj się
          </button>
        </div>
      </div>
    );
  }

  // 6. Pełny dostęp dla zatwierdzonych kont
  return (
    <div className="flex flex-col md:flex-row h-full w-full -mt-8 -mx-4 pb-8 sm:mx-0">
      <WelcomeModal />
      <Sidebar />
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        {children}
      </div>
    </div>
  );
}
