"use client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CheckCircle2, 
  XCircle, 
  User, 
  MapPin, 
  Truck as TruckIcon, 
  Activity, 
  AlertTriangle, 
  Search, 
  Filter, 
  Calendar, 
  Clock, 
  ArrowRight,
  TrendingUp, 
  RefreshCw,
  FileText,
  ChevronRight
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const RouteMap = dynamic(() => import("../components/RouteMap"), { ssr: false });

export default function DispatcherPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState({ totalJobs: 0, totalKm: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);

  // Filtry
  const [searchTerm, setSearchTerm] = useState("");
  const [driverFilter, setDriverFilter] = useState("ALL");
  const [truckFilter, setTruckFilter] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = () => {
    setLoading(true);
    fetch("/api/dispatcher/jobs")
      .then(res => res.json())
      .then(data => {
        if (data.jobs) {
          setJobs(data.jobs);
        }
        if (data.stats) {
          setStats(data.stats);
        }
        setLoading(false);
      })
      .catch(() => {
        toast.error("Nie udało się pobrać tras.");
        setLoading(false);
      });
  };

  // Pomocnik do pobierania nazwy kierowcy zgodnie z priorytetami
  const getDriverDisplayName = (user) => {
    if (!user) return "Nieznany kierowca";
    return user.discordNick || user.firstName || user.name || "Nieznany kierowca";
  };

  // Generowanie dynamicznych list opcji dla filtrów z pobranych tras
  const uniqueDrivers = Array.from(new Set(jobs.map(j => j.user?.id).filter(Boolean)))
    .map(id => {
      const job = jobs.find(j => j.user?.id === id);
      return { id, name: getDriverDisplayName(job.user) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const uniqueTrucks = Array.from(new Set(jobs.map(j => j.truck?.id).filter(Boolean)))
    .map(id => {
      const job = jobs.find(j => j.truck?.id === id);
      return { 
        id, 
        name: `${job.truck.plate} - ${job.truck.brand} ${job.truck.model}` 
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Filtrowanie tras
  const filteredJobs = jobs.filter(job => {
    // 1. Wyszukiwanie tekstowe (kierowca, ładunek, miasta)
    const driverName = getDriverDisplayName(job.user).toLowerCase();
    const cargo = (job.cargo || "").toLowerCase();
    const startCity = (job.startCity || "").toLowerCase();
    const endCity = (job.endCity || "").toLowerCase();
    const term = searchTerm.toLowerCase();
    
    if (searchTerm && !(
      driverName.includes(term) ||
      cargo.includes(term) ||
      startCity.includes(term) ||
      endCity.includes(term)
    )) {
      return false;
    }

    // 2. Kierowca
    if (driverFilter !== "ALL" && job.user?.id !== driverFilter) {
      return false;
    }

    // 3. Ciągnik
    if (truckFilter !== "ALL" && job.truck?.id !== truckFilter) {
      return false;
    }

    // 4. Zakres dat
    if (startDate) {
      const jobDate = new Date(job.createdAt);
      const start = new Date(startDate);
      start.setHours(0,0,0,0);
      if (jobDate < start) return false;
    }
    if (endDate) {
      const jobDate = new Date(job.createdAt);
      const end = new Date(endDate);
      end.setHours(23,59,59,999);
      if (jobDate > end) return false;
    }

    return true;
  });

  // Statystyki globalne z bazy danych
  const statsTotalJobs = stats.totalJobs;
  const statsTotalKm = stats.totalKm;

  const resetFilters = () => {
    setSearchTerm("");
    setDriverFilter("ALL");
    setTruckFilter("ALL");
    setStartDate("");
    setEndDate("");
  };

  const handleTruckClick = (truckId) => {
    if (truckId) {
      router.push(`/dashboard/fleet/${truckId}`);
    }
  };

  return (
    <div className="h-[calc(100vh-2rem)] md:h-[calc(100vh-4rem)] flex flex-col space-y-4 overflow-hidden">
      
      {/* NAGŁÓWEK I ODŚWIEŻANIE */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent">
            Panel Dyspozytorni
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-0.5 text-sm">
            Przeglądaj zlecenia, trasy oraz stan floty w czasie rzeczywistym.
          </p>
        </div>
        
        <button 
          onClick={fetchJobs} 
          disabled={loading}
          className="self-start md:self-auto flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Odśwież dane
        </button>
      </div>

      {/* STATYSTYKI (Tylko 2 karty: Trasy i Dystans) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Wszystkie Trasy</span>
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <Activity className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight">{statsTotalJobs} tras</span>
            <span className="text-xs text-zinc-500 font-medium">pobranych automatycznie</span>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Łączny dystans</span>
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <TrendingUp className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
              {statsTotalKm.toLocaleString()} km
            </span>
            <span className="text-xs text-zinc-500 font-medium">zatwierdzony przebieg</span>
          </div>
        </div>
      </div>

      {/* PASEK FILTROWANIA */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-stretch md:items-end">
        
        {/* Szukaj */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">Wyszukaj trasę</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Kierowca, cargo, miasto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-zinc-50 border border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-zinc-900 dark:text-white"
            />
          </div>
        </div>

        {/* Kierowca */}
        <div className="w-full md:w-[220px]">
          <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">Kierowca</label>
          <select
            value={driverFilter}
            onChange={(e) => setDriverFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-zinc-50 border border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-white"
          >
            <option value="ALL">Wszyscy kierowcy</option>
            {uniqueDrivers.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Ciągnik */}
        <div className="w-full md:w-[220px]">
          <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">Ciągnik</label>
          <select
            value={truckFilter}
            onChange={(e) => setTruckFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-zinc-50 border border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-white"
          >
            <option value="ALL">Wszystkie pojazdy</option>
            {uniqueTrucks.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Data Od */}
        <div className="w-full md:w-[150px]">
          <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">Data od</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-1.5 text-sm bg-zinc-50 border border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-white"
          />
        </div>

        {/* Data Do */}
        <div className="w-full md:w-[150px]">
          <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">Data do</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-1.5 text-sm bg-zinc-50 border border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-white"
          />
        </div>

        {/* Przyciski filtrów */}
        <button
          onClick={resetFilters}
          className="px-4 py-2.5 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-500 dark:text-zinc-400"
        >
          Reset
        </button>
      </div>

      {/* DETALE I TRASY NA CAŁĄ SZEROKOŚĆ */}
      <div className="flex-1 min-h-0">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col overflow-hidden shadow-sm h-full w-full">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 flex justify-between items-center flex-shrink-0">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Lista zgłoszeń
            </span>
            <span className="text-xs bg-zinc-200/60 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-400 px-2 py-0.5 rounded-full font-bold">
              Znaleziono: {filteredJobs.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-sm text-zinc-500">Pobieranie tras z serwera...</p>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="text-center py-12 flex flex-col items-center justify-center h-full">
                <Filter className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-3" />
                <p className="text-zinc-500 text-sm">Brak tras spełniających kryteria.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredJobs.map((job) => (
                  <motion.div 
                    layoutId={`job-card-${job.id}`}
                    key={job.id} 
                    onClick={() => router.push(`/dashboard/dispatcher/${job.id}`)}
                    className="p-5 rounded-2xl cursor-pointer border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 hover:bg-zinc-100/50 dark:bg-zinc-900/40 dark:hover:bg-zinc-800/60 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-lg hover:scale-[1.01] transition-all duration-200 flex flex-col gap-3 relative shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 font-bold">
                        {/* Wyszczególnione zdjęcie profilowe */}
                        {job.user?.image ? (
                          <img 
                            src={job.user.image} 
                            alt={getDriverDisplayName(job.user)} 
                            className="w-5 h-5 rounded-full object-cover border border-zinc-200 dark:border-zinc-700" 
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-850 flex items-center justify-center text-[9px] font-bold text-zinc-500">
                            {getDriverDisplayName(job.user).slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        {getDriverDisplayName(job.user)}
                      </div>
                      <span className="text-[10px] font-semibold text-zinc-400">
                        {new Date(job.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="font-bold flex items-center gap-2 text-sm text-zinc-900 dark:text-white">
                      {job.startCity} 
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-400" /> 
                      {job.endCity}
                    </div>

                    <div className="flex justify-between items-center text-xs text-zinc-550 dark:text-zinc-400 border-t border-zinc-200/60 dark:border-zinc-800/60 pt-2 mt-1">
                      <span>{job.cargo} {job.weight ? `(${job.weight.toLocaleString()} kg)` : ''}</span>
                      <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg">{job.distance} km</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
