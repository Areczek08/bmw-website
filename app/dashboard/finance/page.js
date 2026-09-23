"use client";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  TrendingUp, DollarSign, Activity, Calculator, CheckCircle2, User, 
  RefreshCw, Send, Calendar, FileText, ArrowUpRight, ArrowDownRight, Wallet 
} from "lucide-react";
import { ConfirmModal } from "../../components/ConfirmModal";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const CustomIncomeTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-2xl shadow-2xl text-xs space-y-1">
        <p className="font-bold text-zinc-400 uppercase tracking-wider">{data.fullName || data.name}</p>
        <p className="text-emerald-400 font-extrabold text-sm">
          Przychód: {Number(payload[0].value).toLocaleString()} PLN
        </p>
      </div>
    );
  }
  return null;
};

const CustomKmTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-2xl shadow-2xl text-xs space-y-1">
        <p className="font-bold text-zinc-400 uppercase tracking-wider">{data.fullName || data.name}</p>
        <p className="text-blue-400 font-extrabold text-sm">
          Dystans: {Number(payload[0].value).toLocaleString()} km
        </p>
      </div>
    );
  }
  return null;
};

export default function FinancePage() {
  const [chartData, setChartData] = useState([]);
  const [summary, setSummary] = useState({ income: 0, distance: 0, growth: 0, eurRate: 4.3, balance: 0 });
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmConfig, setConfirmConfig] = useState(null);
  
  // Modes
  const [settleMode, setSettleMode] = useState(false);
  const [paymentMode, setPaymentMode] = useState(false);

  // Settlement states
  const [settling, setSettling] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [costs, setCosts] = useState({ fuel: 0, tickets: 0, maintenance: 0, other: 0 });

  // Payment states
  const [sendingPayment, setSendingPayment] = useState(false);
  const [paymentData, setPaymentData] = useState({
    userId: "",
    amount: "",
    title: `Wynagrodzenie za miesiąc ${new Date().getMonth() === 0 ? 12 : new Date().getMonth()} ${new Date().getMonth() === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear()}`,
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchFinanceData();
  }, []);

  const fetchFinanceData = () => {
    setLoading(true);
    fetch("/api/finance")
      .then(res => res.json())
      .then(data => {
        if(data.data) {
          setChartData(data.data);
          setSummary(data.summary);
          setDrivers(data.drivers || []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const handleCostChange = (field, value) => {
    setCosts(prev => ({ ...prev, [field]: Number(value) }));
  };

  const isSubmittingRef = useRef(false);

  const executeSettleMonth = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSettling(true);

    const idempotencyKey = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `settle-${Date.now()}`;
    const payload = {
      month: Number(month),
      year: Number(year),
      fuelCost: costs.fuel,
      ticketsCost: costs.tickets,
      maintenanceCost: costs.maintenance,
      otherCost: costs.other
    };

    try {
      const res = await fetch("/api/finance/settle", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-idempotency-key": idempotencyKey
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if(res.ok && data.success) {
        toast.success("Pomyślnie rozliczono miesiąc! Saldo firmy zostało zaktualizowane.");
        setSettleMode(false);
        setConfirmConfig(null);
        fetchFinanceData();
      } else {
        toast.error("Błąd: " + (data.error || "Wystąpił błąd rozliczenia."));
      }
    } catch (e) {
      toast.error("Błąd połączenia.");
    } finally {
      setSettling(false);
      isSubmittingRef.current = false;
    }
  };

  const handleSettleMonth = () => {
    setConfirmConfig({
      title: "Podlicz miesiąc",
      message: `Czy na pewno chcesz zamknąć miesiąc ${month}/${year}?`,
      onConfirm: executeSettleMonth
    });
  };

  const executeSendPayment = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSendingPayment(true);

    const idempotencyKey = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `pay-${Date.now()}`;

    try {
      const res = await fetch("/api/finance/transfer", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-idempotency-key": idempotencyKey
        },
        body: JSON.stringify({
          userId: paymentData.userId,
          amount: Number(paymentData.amount),
          title: paymentData.title,
          date: paymentData.date
        })
      });
      const data = await res.json();
      
      if(res.ok && data.success) {
        toast.success("Przelew został pomyślnie zrealizowany!");
        setPaymentData({ ...paymentData, amount: "", userId: "" });
        setPaymentMode(false);
        setConfirmConfig(null);
        fetchFinanceData();
      } else {
        toast.error("Błąd: " + (data.error || "Wystąpił błąd przelewu."));
      }
    } catch (e) {
      toast.error("Błąd połączenia.");
    } finally {
      setSendingPayment(false);
      isSubmittingRef.current = false;
    }
  };

  const handleSendPayment = (e) => {
    e.preventDefault();
    if (!paymentData.userId) return toast.info("Wybierz kierowcę!");
    if (!paymentData.amount || paymentData.amount <= 0) return toast.info("Wpisz poprawną kwotę!");
    
    setConfirmConfig({
      title: "Potwierdź przelew",
      message: `Czy na pewno chcesz wysłać ${paymentData.amount} PLN do wybranego kierowcy?`,
      onConfirm: executeSendPayment
    });
  };

  if (loading && !chartData.length) {
    return <div className="p-12 text-center text-zinc-500 animate-pulse">Ładowanie systemu finansowego...</div>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-zinc-800">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <Wallet className="w-8 h-8 text-amber-400" /> Finanse i Rozliczenia
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">
            Zarządzanie budżetem firmy (NBP EUR/PLN: <strong className="text-zinc-200">{summary.eurRate} PLN</strong>).
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => { setPaymentMode(!paymentMode); setSettleMode(false); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all text-xs border ${
              paymentMode 
                ? 'bg-zinc-800 text-white border-zinc-700' 
                : 'bg-zinc-900 hover:bg-zinc-800 text-emerald-400 border-zinc-800'
            }`}
          >
            <Send className="w-4 h-4" />
            {paymentMode ? "Zamknij Płatności" : "Przelewy Kierowców"}
          </button>
          <button 
            onClick={() => { setSettleMode(!settleMode); setPaymentMode(false); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all text-xs border ${
              settleMode 
                ? 'bg-zinc-800 text-white border-zinc-700' 
                : 'bg-zinc-900 hover:bg-zinc-800 text-amber-400 border-zinc-800'
            }`}
          >
            <Calculator className="w-4 h-4" />
            {settleMode ? "Zamknij Rozliczenie" : "Rozlicz Miesiąc"}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-6 bg-zinc-950 border border-zinc-800 text-white rounded-3xl relative overflow-hidden flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Saldo Główny Firmy (BMS)</p>
              <h3 className="text-3xl font-black text-white">
                {summary.balance.toLocaleString(undefined, {minimumFractionDigits: 2})} <span className="text-sm font-bold text-zinc-400">PLN</span>
              </h3>
            </div>
            <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-amber-400">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
        </div>
        
        <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-3xl flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Przychód (Ostatnie 7 Dni)</p>
                {summary.growth !== undefined && (
                  <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    summary.growth >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    {summary.growth >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {summary.growth}%
                  </span>
                )}
              </div>
              <h3 className="text-3xl font-black text-emerald-400 mt-1">
                {summary.income.toLocaleString()} <span className="text-sm font-bold text-zinc-400">PLN</span>
              </h3>
            </div>
            <div className="p-3 bg-zinc-900 border border-zinc-800 text-emerald-400 rounded-2xl">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-3xl flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Wykonany Dystans (Ostatnie 7 Dni)</p>
              <h3 className="text-3xl font-black text-blue-400">
                {summary.distance.toLocaleString()} <span className="text-sm font-bold text-zinc-400">km</span>
              </h3>
            </div>
            <div className="p-3 bg-zinc-900 border border-zinc-800 text-blue-400 rounded-2xl">
              <Activity className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* SYSTEM PŁATNOŚCI (PRZELEWY) */}
      {paymentMode && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 md:p-8 space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Send className="text-emerald-400 w-5 h-5" /> Przelewy i Wypłaty dla Kierowców
          </h2>

          <form onSubmit={handleSendPayment} className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Odbiorca (Kierowca)</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <select 
                    required
                    value={paymentData.userId} 
                    onChange={(e) => setPaymentData({...paymentData, userId: e.target.value})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-white outline-none focus:border-zinc-700"
                  >
                    <option value="">-- Wybierz kierowcę --</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.name} (Konto: {d.accountBalance} PLN)</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Kwota Przelewu (PLN)</label>
                <input 
                  type="number" 
                  required 
                  min="1" 
                  step="0.01"
                  value={paymentData.amount} 
                  onChange={(e) => setPaymentData({...paymentData, amount: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white font-bold outline-none focus:border-zinc-700" 
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-4 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Tytuł przelewu</label>
                <input 
                  type="text" 
                  required 
                  value={paymentData.title} 
                  onChange={(e) => setPaymentData({...paymentData, title: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white outline-none focus:border-zinc-700" 
                />
              </div>

              <button 
                type="submit"
                disabled={sendingPayment}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all disabled:opacity-50 text-xs flex items-center justify-center gap-2"
              >
                {sendingPayment ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Wykonaj Przelew
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* KALKULATOR ZAMKNIĘCIA MIESIĄCA */}
      {settleMode && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 md:p-8 space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Calculator className="text-amber-400 w-5 h-5" /> Podliczenie Zysków i Rozliczenie Miesiąca
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Miesiąc</label>
                  <input type="number" min="1" max="12" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white font-bold" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Rok</label>
                  <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white font-bold" />
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-zinc-800">
                <h3 className="font-bold text-zinc-300">Koszty Dodatkowe (PLN)</h3>
                
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Koszty paliwa (poza DKV)</label>
                  <input type="number" min="0" value={costs.fuel} onChange={(e) => handleCostChange("fuel", e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Mandaty i opłaty drogowe</label>
                  <input type="number" min="0" value={costs.tickets} onChange={(e) => handleCostChange("tickets", e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Inne wydatki eksploatacyjne</label>
                  <input type="number" min="0" value={costs.other} onChange={(e) => handleCostChange("other", e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-white" />
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between space-y-4">
              <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 text-xs text-zinc-400 leading-relaxed space-y-2">
                <h4 className="font-bold text-zinc-200">Zasada Podliczania Miesiąca:</h4>
                <p>
                  Zamknięcie miesiąca automatycznie obliczy cały przychód ze zweryfikowanych logów tras (Dystans * stawka za km * kurs NBP), odejmie wpisane koszty i dopisze wyliczony zysk netto do głównego salda firmy BMS.
                </p>
              </div>

              <button 
                onClick={handleSettleMonth}
                disabled={settling}
                className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-xl font-bold transition-all disabled:opacity-50 text-xs flex items-center justify-center gap-2"
              >
                {settling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Zatwierdź i Podlicz Miesiąc
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* WYKRESY FINANSOWE (WYKRASY RECHARTS) */}
      {(!settleMode && !paymentMode) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Przychód z Tras Chart */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">
              Przychód z Tras (Ostatnie 7 Dni)
            </h3>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#a1a1aa', fontSize: 12}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#a1a1aa', fontSize: 12}} dx={-10} />
                  <Tooltip content={<CustomIncomeTooltip />} />
                  <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Przejechane Kilometry Chart */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">
              Przejechane Kilometry (Ostatnie 7 Dni)
            </h3>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#a1a1aa', fontSize: 12}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#a1a1aa', fontSize: 12}} dx={-10} />
                  <Tooltip content={<CustomKmTooltip />} />
                  <Bar dataKey="km" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}

      <AnimatePresence>
        {confirmConfig && (
          <ConfirmModal
            isOpen={true}
            onClose={() => setConfirmConfig(null)}
            onConfirm={confirmConfig.onConfirm}
            title={confirmConfig.title}
            message={confirmConfig.message}
            isLoading={settling || sendingPayment}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
