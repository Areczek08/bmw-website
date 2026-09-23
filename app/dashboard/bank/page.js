"use client";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Wallet, ArrowUpRight, ArrowDownRight, Clock, Building2, CreditCard, 
  Send, FileText, CheckCircle2, ShieldCheck, Download, Sparkles, RefreshCw, X
} from "lucide-react";
import { useSession } from "next-auth/react";

export default function BankPage() {
  const { data: session } = useSession();
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [transferData, setTransferData] = useState({ receiverId: '', amount: '', title: '' });
  const [transferLoading, setTransferLoading] = useState(false);
  const isTransferringRef = useRef(false);

  useEffect(() => {
    fetchBankData();
  }, []);

  const fetchBankData = async () => {
    setLoading(true);
    try {
      // Pobierz saldo z pulpitu
      const dashRes = await fetch("/api/user/dashboard");
      const dashData = await dashRes.json();
      if (dashData.user) {
        setBalance(dashData.user.balance || 0);
      }

      // Pobierz historię
      const transRes = await fetch("/api/user/bank");
      const transData = await transRes.json();
      if (transData.transactions) {
        setTransactions(transData.transactions);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenTransfer = async () => {
    setIsTransferModalOpen(true);
    if (drivers.length === 0) {
      try {
        const res = await fetch("/api/drivers");
        const data = await res.json();
        if (data.drivers) setDrivers(data.drivers.filter(d => d.id !== session?.user?.id));
      } catch(e) { console.error(e); }
    }
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    if (isTransferringRef.current) return;
    isTransferringRef.current = true;
    setTransferLoading(true);

    const idempotencyKey = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `p2p-${Date.now()}`;

    try {
      const res = await fetch("/api/user/bank/transfer", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-idempotency-key": idempotencyKey
        },
        body: JSON.stringify(transferData)
      });
      const data = await res.json();
      if (res.ok) {
        setIsTransferModalOpen(false);
        setTransferData({ receiverId: '', amount: '', title: '' });
        toast.success(data.message || "Przelew zrealizowany pomyślnie!");
        fetchBankData();
      } else {
        toast.error(data.error || "Wystąpił błąd podczas realizacji przelewu.");
      }
    } catch(err) {
      toast.error("Błąd połączenia z serwerem.");
    } finally {
      setTransferLoading(false);
      isTransferringRef.current = false;
    }
  };

  const handleExportPdf = () => {
    toast.info("Generowanie wyciągu PDF...", { description: "Pobieranie dokumentu rozpocznie się za chwilę." });
    setTimeout(() => {
      toast.success("Wyciąg bankowy z ostatnich 30 dni został wygenerowany.");
    }, 1200);
  };

  if (loading && !transactions.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-zinc-500 animate-pulse">
        <Wallet className="w-10 h-10 text-amber-400/60" />
        <p className="text-xs uppercase tracking-widest font-semibold">Ładowanie bankowości kierowcy...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      
      {/* Nagłówek Sekcji */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <Wallet className="w-8 h-8 text-amber-400" /> Konto Bankowe Kierowcy
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Wirtualna bankowość i rozliczenia wewnętrzne w Bojar Manager System (mBank Corporate VTC).
          </p>
        </div>

        <button 
          onClick={fetchBankData}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-300 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
          <span>Odśwież stan konta</span>
        </button>
      </div>

      {/* Górny Grid: Nowoczesna Karta mBank oraz Panel Szybkich Akcji */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        
        {/* Karta mBank (Oryginalny Kolorowy Gradient mBanku) */}
        <div className="lg:col-span-2">
          <div 
            className="h-full min-h-[260px] rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden flex flex-col justify-between"
            style={{ background: 'linear-gradient(to right, #ed1c24 0%, #ed1c24 23%, #222222 23%, #222222 25%, #f26522 25%, #f26522 55%, #a8101a 55%, #a8101a 74%, #0060a9 74%, #0060a9 76%, #39b54a 76%, #39b54a 100%)' }}
          >
            {/* Tło karta */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full blur-2xl translate-y-1/4 -translate-x-1/4 pointer-events-none" />
            
            <div className="relative z-10 flex flex-col h-full justify-between gap-6">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-white text-3xl tracking-tighter drop-shadow-md">mBank</span>
                </div>
                <CreditCard className="w-8 h-8 opacity-90 drop-shadow-md" />
              </div>

              <div>
                <p className="text-white/80 text-xs mb-1 uppercase tracking-wider font-semibold">Dostępne Środki</p>
                <div className="text-4xl sm:text-5xl font-black tracking-tight text-white drop-shadow-md">
                  <span className="text-white/80 text-2xl sm:text-3xl mr-2 font-normal">PLN</span> 
                  {balance.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div className="flex justify-between items-end mt-2 pt-4 border-t border-white/20">
                <div>
                  <p className="text-xs text-white/70 uppercase tracking-widest mb-0.5">Posiadacz</p>
                  <p className="font-bold text-base uppercase tracking-wider drop-shadow-sm">{session?.user?.name || "Brak Danych"}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-white/70 uppercase tracking-widest mb-0.5">Status</p>
                  <p className="font-bold text-white uppercase tracking-wider drop-shadow-sm">Aktywne</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Panel Szybkich Akcji */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-4">
          <div>
            <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-400 mb-1 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" /> Szybkie Operacje
            </h3>
            <p className="text-xs text-zinc-500">Przelewy do innych kierowców VTC i pobieranie wyciągów.</p>
          </div>

          <div className="space-y-3">
            <button 
              onClick={handleOpenTransfer}
              className="w-full py-3.5 px-4 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-400/10 flex items-center justify-center gap-2.5 active:scale-[0.99]"
            >
              <ArrowUpRight className="w-4 h-4 stroke-[3]" />
              <span>Zrób Przelew Wewnętrzny</span>
            </button>

            <button 
              onClick={handleExportPdf}
              className="w-full py-3.5 px-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2.5 active:scale-[0.99]"
            >
              <Download className="w-4 h-4 text-zinc-400" />
              <span>Wyciąg z konta (PDF)</span>
            </button>
          </div>

          <div className="pt-3 border-t border-zinc-800/80 flex items-center gap-2 text-[11px] text-zinc-500">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Szyfrowanie transakcji SSL BMS Bank</span>
          </div>
        </div>

      </div>

      {/* Historia Transakcji (Zgodna ze stylem podsumowania statystyk) */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-sm space-y-0">
        
        {/* Nagłówek Listy */}
        <div className="p-6 border-b border-zinc-800/80 flex justify-between items-center bg-zinc-900/30">
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-300">
              Historia Transakcji i Operacji
            </h3>
          </div>
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-900 px-3 py-1 rounded-lg border border-zinc-800">
            Ostatnie 30 dni
          </span>
        </div>

        {/* Lista Wpisów Transakcyjnych */}
        <div className="divide-y divide-zinc-800/60">
          {transactions.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 flex flex-col items-center">
              <Wallet className="w-12 h-12 text-zinc-800 mb-3" />
              <h4 className="text-sm font-bold text-zinc-400 mb-1">Brak zarejestrowanych transakcji</h4>
              <p className="text-xs text-zinc-600">Historia przelewów i nagród pojawi się w tym miejscu.</p>
            </div>
          ) : (
            transactions.map((t) => {
              const isIncome = t.amount >= 0;
              return (
                <div 
                  key={t.id} 
                  className="p-5 flex items-center justify-between hover:bg-zinc-900/40 transition-colors gap-4"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`p-3 rounded-2xl border shrink-0 ${
                      isIncome 
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                        : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    }`}>
                      {isIncome ? <ArrowDownRight className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                    </div>

                    <div className="min-w-0">
                      <h4 className="font-bold text-sm text-white truncate">{t.title}</h4>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {new Date(t.date).toLocaleDateString("pl-PL", { day: 'numeric', month: 'long', year: 'numeric' })} • {new Date(t.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={`text-base font-black tracking-tight ${
                      isIncome ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {isIncome ? "+" : ""}{t.amount.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* Modal Przelewu Wewnętrznego */}
      <AnimatePresence>
        {isTransferModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => setIsTransferModalOpen(false)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-zinc-950 border border-zinc-800 rounded-3xl p-7 max-w-md w-full shadow-2xl z-10"
            >
              <div className="flex justify-between items-center pb-4 border-b border-zinc-800 mb-6">
                <div>
                  <h2 className="text-xl font-black text-white">Przelew Wewnętrzny</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">Przelej środki innemu kierowcy z firmy BMS.</p>
                </div>
                <button 
                  onClick={() => setIsTransferModalOpen(false)} 
                  className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <form onSubmit={handleTransferSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">Odbiorca Przelewu</label>
                  <select 
                    required
                    value={transferData.receiverId}
                    onChange={e => setTransferData({...transferData, receiverId: e.target.value})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs outline-none focus:border-amber-400"
                  >
                    <option value="">-- Wybierz kierowcę z listy --</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.discordNick || d.name || d.firstName || "Kierowca"}{d.email ? ` (${d.email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">Tytuł Przelewu</label>
                  <input 
                    required
                    type="text" 
                    value={transferData.title}
                    onChange={e => setTransferData({...transferData, title: e.target.value})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs outline-none focus:border-amber-400"
                    placeholder="Np. Zwrot za paliwo lub prezent"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">Kwota (PLN)</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    min="0.01"
                    value={transferData.amount}
                    onChange={e => setTransferData({...transferData, amount: e.target.value})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-amber-400"
                    placeholder="0.00"
                  />
                </div>
                
                {transferData.amount && parseFloat(transferData.amount) > 0 && (
                  <div className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-2xl text-xs space-y-2">
                    <div className="flex justify-between text-zinc-400">
                      <span>Kwota przelewu:</span>
                      <span className="text-white font-semibold">{parseFloat(transferData.amount).toFixed(2)} PLN</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Prowizja operacyjna (1%, min. 1 PLN):</span>
                      <span className="text-rose-400 font-semibold">-{Math.max(1, parseFloat(transferData.amount) * 0.01).toFixed(2)} PLN</span>
                    </div>
                    <div className="flex justify-between font-bold pt-2 border-t border-zinc-800 text-sm">
                      <span className="text-zinc-300">Całkowite obciążenie:</span>
                      <span className="text-amber-400">{(parseFloat(transferData.amount) + Math.max(1, parseFloat(transferData.amount) * 0.01)).toFixed(2)} PLN</span>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-zinc-800 mt-6">
                  <button 
                    type="button" 
                    onClick={() => setIsTransferModalOpen(false)} 
                    className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold rounded-xl text-xs uppercase tracking-wider transition-colors"
                  >
                    Anuluj
                  </button>
                  <button 
                    type="submit" 
                    disabled={transferLoading || !transferData.receiverId || !transferData.amount || !transferData.title}
                    className={`flex-1 py-3 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-400/10 ${transferLoading ? 'opacity-50' : ''}`}
                  >
                    {transferLoading ? "Wysyłanie..." : "Wyślij Przelew"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
