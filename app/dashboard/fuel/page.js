"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { 
  CreditCard, Fuel, MapPin, DollarSign, Loader2, Calendar, 
  ChevronLeft, ChevronRight, Sparkles, RefreshCw, AlertTriangle
} from "lucide-react";

// Inteligentna wycena paliwa na podstawie kraju i miasta
const estimateFuelPrice = (country, city) => {
  if (!country) return "";
  
  const normCountry = country.toLowerCase().trim();
  const normCity = city ? city.toLowerCase().trim() : "";
  
  let basePrice = 6.50; // Domyślna
  
  if (normCountry.includes("polsk") || normCountry === "pl" || normCountry === "polska") {
    basePrice = 6.40;
  } else if (normCountry.includes("niemc") || normCountry === "de" || normCountry === "niemcy" || normCountry === "germany") {
    basePrice = 7.95;
  } else if (normCountry.includes("brytan") || normCountry.includes("uk") || normCountry === "gb" || normCountry === "wielka brytania" || normCountry === "england") {
    basePrice = 9.32;
  } else if (normCountry.includes("franc") || normCountry === "fr" || normCountry === "francja" || normCountry === "france") {
    basePrice = 8.45;
  } else if (normCountry.includes("włoch") || normCountry.includes("wloch") || normCountry === "it" || normCountry === "włochy" || normCountry === "italy") {
    basePrice = 8.25;
  } else if (normCountry.includes("holand") || normCountry === "nl" || normCountry === "holandia" || normCountry === "netherlands") {
    basePrice = 8.85;
  } else if (normCountry.includes("belg") || normCountry === "be" || normCountry === "belgia" || normCountry === "belgium") {
    basePrice = 8.10;
  } else if (normCountry.includes("czech") || normCountry === "cz" || normCountry === "czechy" || normCountry === "czech republic") {
    basePrice = 6.60;
  } else if (normCountry.includes("słowac") || normCountry.includes("slowac") || normCountry === "sk" || normCountry === "słowacja" || normCountry === "slovakia") {
    basePrice = 7.35;
  } else if (normCountry.includes("litw") || normCountry === "lt" || normCountry === "litwa" || normCountry === "lithuania") {
    basePrice = 6.90;
  }
  
  const todayStr = new Date().toISOString().slice(0, 10);
  const seedStr = todayStr + normCity;
  
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const fluctuation = ((Math.abs(hash) % 50) - 25) / 100;
  const finalPrice = basePrice + fluctuation;
  
  return Math.max(4.00, Math.min(15.00, finalPrice)).toFixed(2);
};

export default function FuelPage() {
  const { data: session } = useSession();
  
  const [fuelCards, setFuelCards] = useState([]);
  const [cardDataName, setCardDataName] = useState("");
  const [assignedTruck, setAssignedTruck] = useState(null);
  const [trucks, setTrucks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    country: "",
    city: "",
    truckId: "",
    liters: "",
    pricePerLiter: "",
    mileage: "",
    cardType: "" // DKV, SHELL, E100
  });

  // Filter State
  const [filterDriver, setFilterDriver] = useState("");
  const [filterTruck, setFilterTruck] = useState("");
  
  // Card Carousel
  const [activeCardIndex, setActiveCardIndex] = useState(0);

  // Admin Card Management State
  const [drivers, setDrivers] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [selectedDriverCards, setSelectedDriverCards] = useState([]);
  const [isDriverCardsLoading, setIsDriverCardsLoading] = useState(false);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [cardRes, fleetRes, logsRes] = await Promise.all([
        fetch("/api/fuel/card"),
        fetch("/api/fleet"),
        fetch("/api/fuel")
      ]);

      if (cardRes.ok) {
        const cData = await cardRes.json();
        setFuelCards(cData.fuelCards || []);
        setCardDataName(cData.name);
        setAssignedTruck(cData.assignedTruck);
        
        setFormData(prev => ({ 
          ...prev, 
          truckId: cData.assignedTruck?.id || "",
          cardType: cData.fuelCards && cData.fuelCards.length > 0 ? cData.fuelCards[0].type : ""
        }));
      }
      
      if (fleetRes.ok) {
        const fData = await fleetRes.json();
        setTrucks(fData.trucks || []);
      }

      if (logsRes.ok) {
        const lData = await logsRes.json();
        setLogs(lData);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Wystąpił błąd podczas pobierania danych.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (session?.user?.role === "BOARD" || session?.user?.role === "OWNER") {
      fetch("/api/drivers")
        .then(res => res.json())
        .then(data => {
          if (data.drivers) setDrivers(data.drivers);
        })
        .catch(err => console.error("Error fetching drivers:", err));
    }
  }, [session]);

  useEffect(() => {
    if (selectedDriverId) {
      setIsDriverCardsLoading(true);
      fetch(`/api/admin/drivers/${selectedDriverId}/cards`)
        .then(res => res.json())
        .then(data => {
          setSelectedDriverCards(Array.isArray(data) ? data : []);
          setIsDriverCardsLoading(false);
        })
        .catch(err => {
          console.error("Error fetching driver cards:", err);
          setIsDriverCardsLoading(false);
        });
    } else {
      setSelectedDriverCards([]);
    }
  }, [selectedDriverId]);

  const handleAdminAddCard = async (type) => {
    if (!selectedDriverId) return;
    try {
      const res = await fetch(`/api/admin/drivers/${selectedDriverId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type })
      });
      if (res.ok) {
        const updatedRes = await fetch(`/api/admin/drivers/${selectedDriverId}/cards`);
        const updatedData = await updatedRes.json();
        setSelectedDriverCards(Array.isArray(updatedData) ? updatedData : []);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Błąd dodawania karty");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdminDeleteCard = async (cardId) => {
    if (!selectedDriverId || !confirm("Czy na pewno chcesz usunąć tę kartę?")) return;
    try {
      const res = await fetch(`/api/admin/drivers/${selectedDriverId}/cards?cardId=${cardId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        const updatedRes = await fetch(`/api/admin/drivers/${selectedDriverId}/cards`);
        const updatedData = await updatedRes.json();
        setSelectedDriverCards(Array.isArray(updatedData) ? updatedData : []);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Błąd usuwania karty");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const lastEstimatedPriceRef = useRef("");

  useEffect(() => {
    const getEstimate = async () => {
      if (formData.country && formData.city) {
        try {
          const res = await fetch(`/api/fuel?action=estimate&country=${encodeURIComponent(formData.country)}&city=${encodeURIComponent(formData.city)}`);
          let finalPrice = "";
          if (res.ok) {
            const data = await res.json();
            finalPrice = data.price;
          }
          
          if (!finalPrice) {
            finalPrice = estimateFuelPrice(formData.country, formData.city);
          }
          
          setFormData(prev => {
            if (!prev.pricePerLiter || prev.pricePerLiter === lastEstimatedPriceRef.current) {
              lastEstimatedPriceRef.current = finalPrice;
              return { ...prev, pricePerLiter: finalPrice };
            }
            return prev;
          });
        } catch (err) {
          console.error("Error getting fuel price estimate:", err);
        }
      }
    };

    getEstimate();
  }, [formData.country, formData.city]);

  useEffect(() => {
    if (fuelCards.length > 0 && fuelCards[activeCardIndex]) {
      setFormData(prev => ({ ...prev, cardType: fuelCards[activeCardIndex].type }));
    }
  }, [activeCardIndex, fuelCards]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!formData.cardType) {
      setError("Wybierz kartę przed zatankowaniem.");
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/fuel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Błąd podczas dodawania wpisu");
      }

      setFormData(prev => ({
        country: "",
        city: "",
        truckId: assignedTruck?.id || "",
        liters: "",
        pricePerLiter: "",
        mileage: "",
        cardType: prev.cardType
      }));

      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCardNumber = (num) => {
    if (!num) return "XXXX XXXX XXXX XXXX";
    return num.replace(/-/g, " ");
  };

  const filteredLogs = logs.filter(log => {
    const driverMatch = filterDriver ? ((log.user?.firstName || log.user?.name || "")).toLowerCase().includes(filterDriver.toLowerCase()) : true;
    const truckMatch = filterTruck ? ((log.truck?.plate || "")).toLowerCase().includes(filterTruck.toLowerCase()) : true;
    return driverMatch && truckMatch;
  });

  const nextCard = () => {
    setActiveCardIndex((prev) => (prev + 1) % fuelCards.length);
  };

  const prevCard = () => {
    setActiveCardIndex((prev) => (prev === 0 ? fuelCards.length - 1 : prev - 1));
  };

  // Oryginalny wygląd 3 kart firmowych DKV, SHELL, E100 ZACHOWANY
  const getCardStyle = (type) => {
    switch (type) {
      case "DKV":
        return {
          bg: "bg-gradient-to-br from-orange-500 to-orange-700",
          logoText: "DKV",
          logoColor: "text-white",
          accent: "bg-white/10"
        };
      case "SHELL":
        return {
          bg: "bg-gradient-to-br from-yellow-400 to-yellow-500",
          logoText: "SHELL",
          logoColor: "text-red-600",
          accent: "bg-red-500/10"
        };
      case "E100":
        return {
          bg: "bg-gradient-to-br from-emerald-500 to-emerald-700",
          logoText: "E100",
          logoColor: "text-white",
          accent: "bg-black/10"
        };
      default:
        return {
          bg: "bg-gradient-to-br from-zinc-800 to-zinc-950",
          logoText: "BMS",
          logoColor: "text-zinc-400",
          accent: "bg-white/5"
        };
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-zinc-500 animate-pulse">
        <Loader2 className="w-10 h-10 text-amber-400" />
        <p className="text-xs uppercase tracking-widest font-semibold">Ładowanie kart paliwowych...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-amber-400" /> Karty Paliwowe
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Zarządzanie kartami flotowymi (DKV, SHELL, E100) i rejestracja tankowań w trasie.
          </p>
        </div>

        <button 
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-300 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
          <span>Odśwież karty</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl text-xs font-semibold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Lewa Kolumna: Karuzela Kart & Formularz Tankowania */}
        <div className="space-y-6 lg:col-span-1">
          
          {/* Karuzela Kart Paliwowych (Kultowe Wyglądy DKV / SHELL / E100) */}
          <div className="relative">
            {fuelCards.length === 0 ? (
              <div className="bg-zinc-950 border border-zinc-800 border-dashed rounded-3xl h-56 flex flex-col items-center justify-center p-6 text-center text-zinc-500">
                <CreditCard className="w-10 h-10 mb-3 text-zinc-700" />
                <p className="text-xs font-bold text-zinc-400">Brak przypisanej karty paliwowej</p>
                <p className="text-[11px] mt-1 text-zinc-600">Zgłoś się do zarządu w celu przypisania nowej karty.</p>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-3xl shadow-2xl">
                <AnimatePresence mode="wait">
                  <motion.div 
                    key={activeCardIndex}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className={`relative rounded-3xl p-6 shadow-2xl text-white h-56 flex flex-col justify-between border border-white/10 ${getCardStyle(fuelCards[activeCardIndex].type).bg}`}
                  >
                    <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none ${getCardStyle(fuelCards[activeCardIndex].type).accent}`} />
                    <div className={`absolute bottom-0 left-0 w-40 h-40 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none ${getCardStyle(fuelCards[activeCardIndex].type).accent}`} />
                    
                    <div className="flex justify-between items-start z-10">
                      <div>
                        <h3 className={`font-black text-2xl tracking-wider ${getCardStyle(fuelCards[activeCardIndex].type).logoColor}`}>
                          {getCardStyle(fuelCards[activeCardIndex].type).logoText}
                        </h3>
                        <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">
                          Karta firmowa BMS
                        </p>
                      </div>
                      <Fuel className="w-8 h-8 opacity-80" />
                    </div>

                    <div className="z-10 mt-auto mb-4">
                      <p className="font-mono text-xl tracking-[0.2em] font-medium drop-shadow-sm">
                        {formatCardNumber(fuelCards[activeCardIndex].cardNumber)}
                      </p>
                    </div>

                    <div className="flex justify-between items-end z-10">
                      <div>
                        <p className="text-[9px] uppercase font-bold tracking-widest opacity-70 mb-0.5">Przypisana do</p>
                        <p className="font-bold tracking-wide uppercase text-sm drop-shadow-md">{cardDataName || session?.user?.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] uppercase font-bold tracking-widest opacity-70 mb-0.5">Wydano</p>
                        <p className="text-xs font-mono font-medium drop-shadow-md">
                          {new Date(fuelCards[activeCardIndex].issuedAt).toLocaleDateString('pl-PL')}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
                
                {fuelCards.length > 1 && (
                  <>
                    <button 
                      onClick={prevCard} 
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 backdrop-blur-md p-2 rounded-full text-white transition-colors border border-white/10"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={nextCard} 
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 backdrop-blur-md p-2 rounded-full text-white transition-colors border border-white/10"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
                      {fuelCards.map((_, i) => (
                        <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === activeCardIndex ? 'bg-white w-4' : 'bg-white/40'}`} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Panel Zarządzania Kartami Kierowców (Tylko dla Zarządu/Właściciela) */}
          {(session?.user?.role === "BOARD" || session?.user?.role === "OWNER") && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-zinc-950 rounded-3xl p-6 shadow-sm border border-zinc-800 space-y-4"
            >
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-400" />
                Zarządzanie Kartami Floty
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Wybierz Kierowcę</label>
                  <select
                    value={selectedDriverId}
                    onChange={(e) => setSelectedDriverId(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white outline-none focus:border-amber-400 font-bold"
                  >
                    <option value="">-- Wybierz kierowcę z listy --</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.firstName ? `${d.firstName} (${d.name})` : d.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedDriverId && (
                  <div className="space-y-3 pt-2 border-t border-zinc-800/80">
                    <p className="font-bold text-zinc-400">Aktywne karty kierowcy:</p>
                    
                    {isDriverCardsLoading ? (
                      <div className="text-zinc-500 text-center py-2">Ładowanie kart...</div>
                    ) : selectedDriverCards.length === 0 ? (
                      <div className="text-zinc-500 text-center py-2 italic border border-zinc-800 border-dashed rounded-xl bg-zinc-900/30">
                        Brak przypisanych kart.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedDriverCards.map(card => (
                          <div key={card.id} className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-2.5 rounded-xl">
                            <div>
                              <span className="font-bold text-white block">{card.type}</span>
                              <span className="text-[10px] font-mono text-zinc-500">{card.cardNumber}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAdminDeleteCard(card.id)}
                              className="text-rose-500 hover:text-rose-400 font-bold text-[10px] uppercase bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1 rounded-lg"
                            >
                              Usuń
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pt-2 border-t border-zinc-800/80">
                      <p className="font-bold text-zinc-400 mb-2">Przydziel nową kartę:</p>
                      <div className="flex gap-2">
                        {["DKV", "SHELL", "E100"].map(type => {
                          const hasCard = selectedDriverCards.some(c => c.type === type);
                          return (
                            <button
                              key={type}
                              type="button"
                              disabled={hasCard}
                              onClick={() => handleAdminAddCard(type)}
                              className="flex-1 py-2 rounded-xl font-bold text-[11px] uppercase bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              + {type}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Formularz Rejestracji Tankowania */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`bg-zinc-950 rounded-3xl p-6 shadow-sm border border-zinc-800 ${fuelCards.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-4 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-400" />
              Zarejestruj Nowe Tankowanie
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              
              <div>
                <label className="block font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Wybrana Karta</label>
                <select
                  name="cardType"
                  required
                  value={formData.cardType}
                  onChange={(e) => {
                    handleInputChange(e);
                    const idx = fuelCards.findIndex(c => c.type === e.target.value);
                    if (idx !== -1) setActiveCardIndex(idx);
                  }}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white outline-none focus:border-amber-400 font-bold"
                >
                  <option value="">Wybierz kartę z listy...</option>
                  {fuelCards.map(c => (
                    <option key={c.id} value={c.type}>
                      Karta {c.type} ({formatCardNumber(c.cardNumber).slice(-4)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Kraj</label>
                  <input
                    type="text"
                    name="country"
                    required
                    value={formData.country}
                    onChange={handleInputChange}
                    placeholder="np. Polska"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Miasto</label>
                  <input
                    type="text"
                    name="city"
                    required
                    value={formData.city}
                    onChange={handleInputChange}
                    placeholder="np. Poznań"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Ciągnik Siodłowy</label>
                <select
                  name="truckId"
                  required
                  value={formData.truckId}
                  onChange={handleInputChange}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white outline-none focus:border-amber-400"
                >
                  <option value="">-- Wybierz pojazd --</option>
                  {trucks.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.brand} {t.model} ({t.plate}) - Nr {t.fleetNumber}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Ilość Litrów (L)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="liters"
                    required
                    value={formData.liters}
                    onChange={handleInputChange}
                    placeholder="np. 450"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white outline-none focus:border-amber-400 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Cena za Litr (PLN)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="pricePerLiter"
                    required
                    value={formData.pricePerLiter}
                    onChange={handleInputChange}
                    placeholder="np. 6.45"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white outline-none focus:border-amber-400 font-bold"
                  />
                  {formData.pricePerLiter && formData.pricePerLiter === lastEstimatedPriceRef.current && (
                    <span className="text-[10px] text-amber-400 font-bold flex items-center gap-1 mt-1">
                      <Sparkles className="w-3 h-3" /> Inteligentna cena lokalna
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Przebieg Pojazdu (KM)</label>
                <input
                  type="number"
                  name="mileage"
                  required
                  value={formData.mileage}
                  onChange={handleInputChange}
                  placeholder="np. 342150"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white outline-none focus:border-amber-400 font-mono"
                />
              </div>

              {formData.liters && formData.pricePerLiter && (
                <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl flex justify-between items-center">
                  <span className="text-xs text-zinc-400 font-semibold uppercase">Koszt całościowy:</span>
                  <span className="font-black text-lg text-rose-400">
                    -{(parseFloat(formData.liters) * parseFloat(formData.pricePerLiter)).toFixed(2)} PLN
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || fuelCards.length === 0}
                className="w-full py-3.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-400/10 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Zapisz i obciąż konto"}
              </button>
            </form>
          </motion.div>
        </div>

        {/* Prawa Kolumna: Tabela Logów Tankowania */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-zinc-950 rounded-3xl p-6 shadow-sm border border-zinc-800 h-[calc(100vh-12rem)] flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6 pb-4 border-b border-zinc-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                Rejestr i Historia Tankowań
              </h3>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Kierowca..."
                  value={filterDriver}
                  onChange={(e) => setFilterDriver(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-amber-400 w-32"
                />
                <input
                  type="text"
                  placeholder="Rejestracja..."
                  value={filterTruck}
                  onChange={(e) => setFilterTruck(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-amber-400 w-32"
                />
              </div>
            </div>

            <div className="overflow-auto flex-1 pr-1 space-y-2">
              <table className="w-full text-xs text-left">
                <thead className="text-[11px] uppercase bg-zinc-900 text-zinc-400 sticky top-0 border-b border-zinc-800">
                  <tr>
                    <th className="px-4 py-3 rounded-l-xl">Data</th>
                    <th className="px-4 py-3">Kierowca</th>
                    <th className="px-4 py-3">Karta</th>
                    <th className="px-4 py-3">Pojazd</th>
                    <th className="px-4 py-3">Lokalizacja</th>
                    <th className="px-4 py-3 text-right rounded-r-xl">Koszt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center py-12 text-zinc-500">
                        Brak zarejestrowanych logów tankowania.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="px-4 py-3 font-mono text-zinc-400 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleDateString("pl-PL")} {new Date(log.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </td>
                        <td className="px-4 py-3 font-bold text-white">
                          {log.user.discordNick || log.user.firstName || log.user.name}
                        </td>
                        <td className="px-4 py-3 font-bold text-amber-400">
                          {log.cardType || "-"}
                        </td>
                        <td className="px-4 py-3 font-mono text-zinc-300">
                          {log.truck.plate}
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5 text-zinc-400">
                            <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                            {log.city}, {log.country}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="font-black text-rose-400 text-sm">-{log.totalCost.toFixed(2)} PLN</div>
                          <div className="text-[10px] text-zinc-500 font-semibold">{log.liters} L • {log.pricePerLiter} PLN/L</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
