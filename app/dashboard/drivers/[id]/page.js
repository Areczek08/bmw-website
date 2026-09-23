"use client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, User, Truck, MapPin, Activity, Star, Calendar, Music, 
  MessageSquare, Award, Clock, FileText, CheckCircle2, Link as LinkIcon, 
  Edit2, X, Save, Globe, ExternalLink, ShieldAlert, Sparkles, CreditCard
} from "lucide-react";
import Link from "next/link";
import { ConfirmModal } from "../../../components/ConfirmModal";
import LicensePlate from "../../../components/LicensePlate";
import { useParams, useRouter } from "next/navigation";

function TrucksBookLogo({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#3182CE" />
      <path d="M16 26H64V38H45V82H33V38H16V26Z" fill="white" />
      <path d="M48 34H68C76 34 82 39 82 46C82 51 78 55 72 57C80 59 85 64 85 71C85 80 77 85 67 85H48V34ZM60 44V52H67C70.5 52 73 50 73 48C73 46 70.5 44 67 44H60ZM60 62V75H68C72 75 75 73 75 68.5C75 64 72 62 68 62H60Z" fill="white" />
    </svg>
  );
}

function FacebookLogo({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

function DiscordLogo({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#5865F2">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z"/>
    </svg>
  );
}

export default function DriverProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isCardProcessing, setIsCardProcessing] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState(null);

  useEffect(() => {
    fetchDriver();
  }, [params.id, router]);

  const fetchDriver = () => {
    setLoading(true);
    fetch(`/api/drivers/${params.id}`)
      .then(res => res.json())
      .then(data => {
        if(data.driver) {
          setDriver(data.driver);
          setEditForm({
            ...data.driver,
            discordNick: data.driver.discordNick || "",
            facebookUrl: data.driver.facebookUrl || "",
            trucksBookUrl: data.driver.trucksBookUrl || "",
            trucksBookName: data.driver.trucksBookName || "",
            steamUrl: data.driver.steamUrl || "",
            truckId: data.driver.assignedTruck?.id || "",
            trailerId: data.driver.assignedTruck?.attachedTrailer?.id || "",
            birthDate: data.driver.birthDate || "",
            contractType: data.driver.contractType || "Umowa o pracę",
            initialMileage: data.driver.initialMileage || 0,
            initialDeliveries: data.driver.initialDeliveries || 0
          });
        } else {
          router.push("/dashboard/drivers");
        }
        setLoading(false);
      })
      .catch(() => {
        router.push("/dashboard/drivers");
      });
  };

  if (loading && !driver) {
    return <div className="p-12 text-center text-zinc-500 animate-pulse">Ładowanie profilu kierowcy...</div>;
  }
  
  if (!driver) return null;

  const isMyProfile = session?.user?.email === driver.email || session?.user?.id === driver.id;
  const canManage = ["BOARD", "OWNER", "DISPATCHER"].includes(session?.user?.role);
  const isBoard = ["BOARD", "OWNER"].includes(session?.user?.role);
  const canEdit = isMyProfile || canManage;

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Maksymalny rozmiar pliku to 5MB!");
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error("Dozwolone są tylko zdjęcia (JPEG, PNG, WebP)!");
      return;
    }

    setIsUploadingAvatar(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });

      const data = await res.json();
      if (res.ok && data.success && data.url) {
        setEditForm(prev => ({ ...prev, image: data.url }));
        toast.success("Zdjęcie zostało pomyślnie przesłane!");
      } else {
        toast.error(data.error || "Wystąpił błąd podczas wgrywania zdjęcia.");
      }
    } catch (err) {
      toast.error("Błąd połączenia podczas wgrywania pliku.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const cleanPayload = {
        name: editForm.name,
        firstName: editForm.firstName,
        aboutMe: editForm.aboutMe,
        discordNick: editForm.discordNick,
        facebookUrl: editForm.facebookUrl,
        trucksBookUrl: editForm.trucksBookUrl,
        trucksBookName: editForm.trucksBookName,
        steamUrl: editForm.steamUrl,
        spotifyUrl: editForm.spotifyUrl,
        image: editForm.image !== undefined ? editForm.image : undefined
      };

      if (canManage) {
        cleanPayload.birthDate = editForm.birthDate || null;
        cleanPayload.contractType = editForm.contractType;
        cleanPayload.role = editForm.role;
        cleanPayload.rank = editForm.rank;
        cleanPayload.driverStatus = editForm.driverStatus;
        cleanPayload.monthlyLimitKm = editForm.monthlyLimitKm;
        cleanPayload.initialMileage = editForm.initialMileage;
        cleanPayload.initialDeliveries = editForm.initialDeliveries;
        cleanPayload.truckId = editForm.truckId || null;
        cleanPayload.trailerId = editForm.trailerId || null;
      }

      const res = await fetch(`/api/drivers/${driver.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanPayload)
      });
      const data = await res.json();
      if(res.ok && data.success) {
        toast.success("Profil został zaktualizowany!");
        setIsEditing(false);
        fetchDriver();
      } else {
        toast.error(data.error || "Wystąpił błąd podczas zapisywania profilu.");
      }
    } catch(err) {
      toast.error("Błąd połączenia.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCard = async (type) => {
    try {
      const res = await fetch(`/api/admin/drivers/${driver.id}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type })
      });
      if (res.ok) {
        toast.success(`Przypisano kartę ${type}`);
        fetchDriver();
      } else {
        const err = await res.json();
        toast.error(err.error || "Błąd przypisywania karty");
      }
    } catch (err) {
      toast.error("Błąd połączenia");
    }
  };

  const handleDeleteCard = async (cardId) => {
    if (!confirm("Czy na pewno chcesz usunąć tę kartę paliwową?")) return;
    try {
      const res = await fetch(`/api/admin/drivers/${driver.id}/cards?cardId=${cardId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        toast.success("Usunięto kartę paliwową");
        fetchDriver();
      } else {
        const err = await res.json();
        toast.error(err.error || "Błąd usuwania karty");
      }
    } catch (err) {
      toast.error("Błąd połączenia");
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Brak";
    return new Date(dateString).toLocaleDateString("pl-PL", { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const getStatusDot = (status) => {
    switch(status) {
      case "ON_ROUTE": return <span className="w-3 h-3 rounded-full bg-blue-500 ring-4 ring-zinc-950"></span>;
      case "ACTIVE": return <span className="w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-zinc-950"></span>;
      case "ON_LEAVE": return <span className="w-3 h-3 rounded-full bg-amber-500 ring-4 ring-zinc-950"></span>;
      case "SUSPENDED": return <span className="w-3 h-3 rounded-full bg-rose-500 ring-4 ring-zinc-950"></span>;
      default: return <span className="w-3 h-3 rounded-full bg-zinc-500 ring-4 ring-zinc-950"></span>;
    }
  };

  const getStatusText = (status) => {
    switch(status) {
      case "ACTIVE": return "Aktywny";
      case "ON_LEAVE": return "Urlop";
      case "ON_ROUTE": return "W trasie";
      case "OFFLINE": return "Offline";
      case "SUSPENDED": return "Zawieszony";
      default: return "Offline";
    }
  };
  
  const getSpotifyEmbed = (url) => {
    if (!url) return null;
    const trackIdMatch = url.match(/track\/([a-zA-Z0-9]+)/);
    if (!trackIdMatch) return null;
    return `https://open.spotify.com/embed/track/${trackIdMatch[1]}?utm_source=generator&theme=0`;
  };

  const isOwnerOrBoardRole = ["OWNER", "BOARD"].includes(driver.role);

  // ---------------- FORMULARZ EDYCJI ----------------
  if (isEditing) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-16">
        <div className="flex justify-between items-center pb-4 border-b border-zinc-800">
          <div>
            <h2 className="text-2xl font-black text-white">Edycja Profilu: {driver.name}</h2>
            <p className="text-xs text-zinc-400">Zaktualizuj swoje dane, opis oraz odnośniki społecznościowe.</p>
          </div>
          <button onClick={() => setIsEditing(false)} className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-zinc-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            
            {/* Sekcja 1: Ogólne */}
            <div className="space-y-4">
              <h3 className="font-bold text-amber-400 uppercase tracking-wider text-xs border-b border-zinc-800 pb-2">Informacje Ogólne</h3>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Zdjęcie / Awatar (URL lub Z Dysku)</label>
                <div className="flex gap-2 items-center">
                  <input 
                    type="text" 
                    value={editForm.image || ""} 
                    onChange={e => setEditForm({...editForm, image: e.target.value})}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs outline-none focus:border-zinc-700"
                    placeholder="https://..."
                  />
                  <label className="cursor-pointer bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-3 py-3 rounded-xl text-xs font-bold transition-colors whitespace-nowrap text-zinc-200">
                    {isUploadingAvatar ? "Wgrywanie..." : "Wgraj (Max 5MB)"}
                    <input 
                      type="file" 
                      accept="image/jpeg,image/png,image/webp" 
                      className="hidden" 
                      onChange={handleAvatarUpload}
                      disabled={isUploadingAvatar}
                    />
                  </label>
                  {editForm.image && (
                    <button
                      type="button"
                      onClick={() => setEditForm(prev => ({ ...prev, image: "" }))}
                      className="px-3 py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold transition-colors"
                      title="Usuń zdjęcie profilowe"
                    >
                      Usuń
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Nazwa użytkownika (Login)</label>
                <input 
                  type="text" 
                  value={editForm.name || ""} 
                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs outline-none focus:border-zinc-700"
                  placeholder="Login z rejestracji"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Imię (np. Arkadiusz)</label>
                <input 
                  type="text" 
                  value={editForm.firstName || ""} 
                  onChange={e => setEditForm({...editForm, firstName: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs outline-none focus:border-zinc-700"
                  placeholder="Imię kierowcy"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Opis "O Mnie"</label>
                <textarea 
                  rows={3}
                  value={editForm.aboutMe || ""} 
                  onChange={e => setEditForm({...editForm, aboutMe: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs outline-none focus:border-zinc-700 resize-none"
                  placeholder="Krótki cytat lub opis..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Spotify Link (Utwór)</label>
                <input 
                  type="text" 
                  value={editForm.spotifyUrl || ""} 
                  onChange={e => setEditForm({...editForm, spotifyUrl: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs outline-none focus:border-zinc-700"
                  placeholder="https://open.spotify.com/track/..."
                />
              </div>
            </div>

            {/* Sekcja 2: Social Media (Discord, Facebook, TrucksBook) */}
            <div className="space-y-4">
              <h3 className="font-bold text-amber-400 uppercase tracking-wider text-xs border-b border-zinc-800 pb-2">Social Media i Discord</h3>
              
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Discord Nick / Tag</label>
                <input 
                  type="text" 
                  value={editForm.discordNick || ""} 
                  onChange={e => setEditForm({...editForm, discordNick: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs outline-none focus:border-zinc-700"
                  placeholder="Np. arexxik lub arexxik#1234"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Profil Facebook (URL)</label>
                <input 
                  type="text" 
                  value={editForm.facebookUrl || ""} 
                  onChange={e => setEditForm({...editForm, facebookUrl: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs outline-none focus:border-zinc-700"
                  placeholder="https://facebook.com/..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Profil TrucksBook (TB Link)</label>
                <input 
                  type="text" 
                  value={editForm.trucksBookUrl || ""} 
                  onChange={e => setEditForm({...editForm, trucksBookUrl: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs outline-none focus:border-zinc-700"
                  placeholder="https://trucksbook.eu/profile/..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Nickname TrucksBook (do webhooka)</label>
                <input 
                  type="text" 
                  value={editForm.trucksBookName || ""} 
                  onChange={e => setEditForm({...editForm, trucksBookName: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs outline-none focus:border-zinc-700"
                  placeholder="np. arexxik"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Profil Steam (URL)</label>
                <input 
                  type="text" 
                  value={editForm.steamUrl || ""} 
                  onChange={e => setEditForm({...editForm, steamUrl: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs outline-none focus:border-zinc-700"
                  placeholder="https://steamcommunity.com/id/..."
                />
              </div>
            </div>
          </div>

          {/* Sekcja dla Zarządu */}
          {canManage && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-zinc-800 text-sm">
              <div className="space-y-4">
                <h3 className="font-bold text-amber-400 uppercase tracking-wider text-xs border-b border-zinc-800 pb-2">Przydział Floty</h3>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Ciągnik Siodłowy</label>
                  <select 
                    value={editForm.truckId || ""} 
                    onChange={e => setEditForm({...editForm, truckId: e.target.value})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs outline-none focus:border-zinc-700"
                  >
                    <option value="">Brak ciągnika</option>
                    {driver.availableTrucks?.map(truck => (
                      <option key={truck.id} value={truck.id}>
                        {truck.brand} {truck.model} ({truck.plate})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Przypisana Naczepa</label>
                  <select 
                    value={editForm.trailerId || ""} 
                    onChange={e => setEditForm({...editForm, trailerId: e.target.value})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs outline-none focus:border-zinc-700"
                    disabled={!editForm.truckId}
                  >
                    <option value="">Brak naczepy</option>
                    {driver.availableTrailers?.map(trailer => (
                      <option key={trailer.id} value={trailer.id}>
                        {trailer.brand} {trailer.type} ({trailer.plate})
                      </option>
                    ))}
                  </select>
                  {!editForm.truckId && (
                    <p className="text-[10px] text-zinc-500 mt-1">Najpierw wybierz ciągnik siodłowy, aby móc przypisać naczepę.</p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-amber-400 uppercase tracking-wider text-xs border-b border-zinc-800 pb-2">Dane Kadrowe i Status</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Rola w Systemie</label>
                    <select 
                      value={editForm.role || "DRIVER"} 
                      onChange={e => setEditForm({...editForm, role: e.target.value})}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs"
                    >
                      <option value="DRIVER">Kierowca</option>
                      <option value="DISPATCHER">Dyspozytor</option>
                      <option value="BOARD">Zarząd</option>
                      <option value="OWNER">Właściciel</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Ranga / Stanowisko</label>
                    <input 
                      type="text" 
                      value={editForm.rank || ""} 
                      onChange={e => setEditForm({...editForm, rank: e.target.value})}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs"
                      placeholder="np. Prezes, Właściciel"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Typ Umowy</label>
                    <select 
                      value={editForm.contractType || "Umowa o pracę"} 
                      onChange={e => setEditForm({...editForm, contractType: e.target.value})}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs"
                    >
                      <option value="Umowa o pracę">Umowa o pracę</option>
                      <option value="Umowa zlecenie">Umowa zlecenie</option>
                      <option value="B2B">B2B</option>
                      <option value="Umowa próbna">Umowa próbna</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Data Urodzenia</label>
                    <input 
                      type="date" 
                      value={(() => {
                        if (!editForm.birthDate) return "";
                        try {
                          return new Date(editForm.birthDate).toISOString().split('T')[0];
                        } catch (e) {
                          return "";
                        }
                      })()} 
                      onChange={e => setEditForm({...editForm, birthDate: e.target.value})}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">KM Poza Systemem</label>
                    <input 
                      type="number" 
                      value={editForm.initialMileage || 0} 
                      onChange={e => setEditForm({...editForm, initialMileage: parseInt(e.target.value) || 0})}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs outline-none"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Dostawy Poza Systemem</label>
                    <input 
                      type="number" 
                      value={editForm.initialDeliveries || 0} 
                      onChange={e => setEditForm({...editForm, initialDeliveries: parseInt(e.target.value) || 0})}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Status Kierowcy</label>
                  <select 
                    value={editForm.driverStatus || "OFFLINE"} 
                    onChange={e => setEditForm({...editForm, driverStatus: e.target.value})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-xs"
                  >
                    <option value="ACTIVE">Aktywny</option>
                    <option value="OFFLINE">Offline</option>
                    <option value="ON_ROUTE">W trasie</option>
                    <option value="ON_LEAVE">Urlop</option>
                    <option value="SUSPENDED">Zawieszony</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Karty Paliwowe (Tylko dla Zarządu) */}
          {isBoard && (
            <div className="pt-6 border-t border-zinc-800 space-y-4">
              <h3 className="font-bold text-amber-400 uppercase tracking-wider text-xs border-b border-zinc-800 pb-2">
                Karty Paliwowe Kierowcy
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Lewa kolumna: Przypisane karty */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Przypisane karty</h4>
                  <div className="space-y-2">
                    {driver.fuelCards && driver.fuelCards.length > 0 ? (
                      driver.fuelCards.map(card => (
                        <div key={card.id} className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-3 rounded-xl text-xs">
                          <div>
                            <span className="font-bold text-white block text-sm">{card.type}</span>
                            <span className="text-[11px] text-zinc-500 font-mono tracking-wider">{card.cardNumber}</span>
                          </div>
                          <button 
                            type="button"
                            onClick={() => handleDeleteCard(card.id)}
                            className="text-rose-500 hover:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 p-2 rounded-lg transition-all"
                            title="Usuń kartę"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="py-6 text-center text-zinc-500 text-xs border border-zinc-800 border-dashed rounded-xl bg-zinc-900/30">
                        Brak przypisanych kart.
                      </div>
                    )}
                  </div>
                </div>

                {/* Prawa kolumna: Wydaj nową kartę */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Wydaj nową kartę paliwową</h4>
                  <div className="space-y-2.5">
                    {[
                      { 
                        type: "DKV", 
                        desc: "Podstawowa karta na Europę Zachodnią (PL, Niemcy, Francja, Belgia, Holandia, Austria, Włochy, Hiszpania, Portugalia itp.)",
                        colorClass: "bg-amber-500 text-zinc-950"
                      },
                      { 
                        type: "SHELL", 
                        desc: "Dla kierowców regionu wschodniego i w krajach Shell (Niemcy, Holandia, Belgia, Francja, Słowacja) wysoce limitowana do 250l.",
                        colorClass: "bg-amber-500 text-zinc-950"
                      },
                      { 
                        type: "E100", 
                        desc: "Podstawowa karta na kraje wschodnie i tranzytowe (Bałtyk, Węgry i pozostałe kraje Azji Centralnej).",
                        colorClass: "bg-emerald-500 text-zinc-950"
                      }
                    ].map(btn => {
                      const hasCard = driver.fuelCards?.some(c => c.type === btn.type);
                      return (
                        <button
                          key={btn.type}
                          type="button"
                          disabled={hasCard}
                          onClick={() => handleAddCard(btn.type)}
                          className="w-full flex items-center text-left bg-zinc-900 border border-zinc-800 hover:border-zinc-700 p-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                        >
                          <span className={`w-16 text-center py-1.5 rounded-lg font-black text-[10px] uppercase shrink-0 transition-colors ${btn.colorClass}`}>
                            {btn.type}
                          </span>
                          <span className="ml-3 text-[11px] leading-relaxed text-zinc-400 group-hover:text-zinc-300">
                            {btn.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t border-zinc-800 gap-3">
            <button type="button" onClick={() => setIsEditing(false)} className="px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 font-bold text-zinc-300 transition-colors text-xs">
              Anuluj
            </button>
            <button type="button" onClick={handleSave} disabled={isSaving} className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 font-bold text-white transition-colors text-xs flex items-center gap-2">
              <Save className="w-4 h-4 text-amber-400" />
              {isSaving ? "Zapisywanie..." : "Zapisz Zmiany"}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {confirmConfig && (
            <ConfirmModal
              isOpen={true}
              onClose={() => setConfirmConfig(null)}
              onConfirm={confirmConfig.onConfirm}
              title={confirmConfig.title}
              message={confirmConfig.message}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ---------------- GŁÓWNY WIDOK PROFILU KIEROWCY ----------------
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      
      {/* Top Bar Navigation */}
      <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
           <Link href="/dashboard/drivers" className="hover:text-white transition-colors flex items-center gap-1.5">
             <ArrowLeft className="w-4 h-4" /> Lista Kierowców
           </Link>
           <span>/</span>
           <span className="text-white font-bold">{driver.discordNick || driver.name || driver.firstName}</span>
        </div>

        {canEdit && (
          <button 
            onClick={() => setIsEditing(true)} 
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 rounded-xl text-xs font-bold transition-all border border-zinc-800"
          >
            <Edit2 className="w-3.5 h-3.5 text-amber-400" /> Edytuj profil
          </button>
        )}
      </div>

      {/* Grid Główny: Profil & Zestaw */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Lewa Kartka: Awatar i Karta Profilu */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between lg:col-span-1"
        >
          <div className="space-y-5">
             <div className="flex items-start gap-4">
                <div className="relative shrink-0">
                   {driver.image ? (
                     <img src={driver.image} className="w-24 h-24 rounded-2xl object-cover bg-zinc-900 border border-zinc-800 shadow-md" alt="Avatar"/>
                   ) : (
                     <div className="w-24 h-24 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-4xl font-black text-zinc-500 shadow-md">
                       {(driver.name || "K")[0]}
                     </div>
                   )}
                   <div className="absolute -bottom-1 -right-1">
                     {getStatusDot(driver.driverStatus)}
                   </div>
                </div>
                
                <div className="flex flex-col flex-1 min-w-0">
                   <div className="flex items-center gap-2 mb-1">
                     <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                       isOwnerOrBoardRole 
                         ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                         : 'bg-zinc-900 text-zinc-300 border-zinc-800'
                     }`}>
                       {driver.rank || (driver.role === "OWNER" ? "WŁAŚCICIEL" : driver.role === "BOARD" ? "ZARZĄD" : "KIEROWCA")}
                     </span>
                   </div>
                   
                   <h1 className="font-extrabold text-2xl text-white truncate leading-tight">
                     {driver.discordNick || driver.name || driver.firstName}
                   </h1>
                   <p className="text-xs text-zinc-500 font-medium truncate mt-0.5">
                     {driver.firstName ? `${driver.firstName} (${driver.name})` : driver.name}
                   </p>

                   <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400">
                     <Activity className="w-3.5 h-3.5 text-amber-400" />
                     <span>Status:</span>
                     <span className="text-zinc-200 font-bold">{getStatusText(driver.driverStatus)}</span>
                   </div>
                </div>
             </div>

             {/* Social Links Bar (Discord, Facebook, TrucksBook, Steam) */}
             <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800/80">
                {driver.discordNick && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-[#5865F2]/10 border border-[#5865F2]/25 rounded-xl text-xs text-indigo-200 font-semibold">
                    <DiscordLogo className="w-4 h-4 shrink-0" />
                    <span>Discord: <strong className="text-white">{driver.discordNick}</strong></span>
                  </div>
                )}

                {driver.trucksBookUrl && (
                  <a 
                    href={driver.trucksBookUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#3182CE]/10 hover:bg-[#3182CE]/20 border border-[#3182CE]/30 rounded-xl text-xs text-blue-400 font-semibold transition-colors"
                  >
                    <TrucksBookLogo className="w-4 h-4 shrink-0 rounded-[3px]" />
                    <span>TB: <strong className="text-white">{driver.trucksBookName || "Profil"}</strong></span>
                    <ExternalLink className="w-3 h-3 text-zinc-500" />
                  </a>
                )}

                {!driver.trucksBookUrl && driver.trucksBookName && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-[#3182CE]/10 border border-[#3182CE]/30 rounded-xl text-xs text-blue-400 font-semibold">
                    <TrucksBookLogo className="w-4 h-4 shrink-0 rounded-[3px]" />
                    <span>TB: <strong className="text-white">{driver.trucksBookName}</strong></span>
                  </div>
                )}

                {driver.facebookUrl && (
                  <a 
                    href={driver.facebookUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#1877F2]/10 hover:bg-[#1877F2]/20 border border-[#1877F2]/30 rounded-xl text-xs text-blue-400 font-semibold transition-colors"
                  >
                    <FacebookLogo className="w-4 h-4 shrink-0" />
                    <span>Facebook</span>
                    <ExternalLink className="w-3 h-3 text-zinc-500" />
                  </a>
                )}

                {driver.steamUrl && (
                  <a 
                    href={driver.steamUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/25 rounded-xl text-xs text-sky-300 font-semibold transition-colors"
                  >
                    <Globe className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Steam</span>
                    <ExternalLink className="w-3 h-3 text-zinc-500" />
                  </a>
                )}
             </div>

             {driver.aboutMe && (
               <div className="pt-3 border-t border-zinc-800/80 flex gap-2 text-xs text-zinc-400 italic">
                 <MessageSquare className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                 <span>"{driver.aboutMe}"</span>
               </div>
             )}
          </div>
        </motion.div>

        {/* Prawa Kartka: Powiększony Ciągnik Siodłowy (Klikalny) */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-sm flex flex-col lg:col-span-2 justify-between"
        >
          <div className="p-4 px-6 border-b border-zinc-800/80 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-300">
                Ciągnik Siodłowy Kierowcy
              </h3>
            </div>
            {driver.assignedTruck && (
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800">
                Kliknij, aby przejść do pojazdu
              </span>
            )}
          </div>

          <div className="p-6 flex-1 flex flex-col justify-center">
            {driver.assignedTruck ? (
              <Link 
                href={`/dashboard/fleet/${driver.assignedTruck.id}`}
                className="w-full bg-zinc-900/60 border border-zinc-800 hover:border-amber-500/50 rounded-2xl overflow-hidden flex flex-col md:flex-row group transition-all cursor-pointer shadow-sm hover:shadow-lg"
              >
                {/* Obrazek Ciągnika */}
                <div className="md:w-1/2 h-52 md:h-60 relative bg-zinc-950 overflow-hidden shrink-0">
                  {driver.assignedTruck.imageUrl ? (
                     <img src={driver.assignedTruck.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90" alt="Truck" />
                  ) : (
                     <div className="flex items-center justify-center h-full"><Truck className="w-20 h-20 text-zinc-800" /></div>
                  )}
                </div>

                {/* Opis Ciągnika i Dedykowana Sekcja Rejestracji */}
                <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider mb-1">Dedykowany Ciągnik Siodłowy</p>
                        <h4 className="font-black text-2xl text-white uppercase leading-tight group-hover:text-amber-400 transition-colors">
                          {driver.assignedTruck.brand} {driver.assignedTruck.model}
                        </h4>
                      </div>
                      <span className="text-xs font-bold text-amber-400 group-hover:translate-x-1 transition-transform flex items-center gap-1 shrink-0">
                        Podgląd <ExternalLink className="w-3.5 h-3.5" />
                      </span>
                    </div>

                    <p className="text-xs text-zinc-400">
                      Numer flotowy: <strong className="text-white">#{driver.assignedTruck.fleetNumber || "N/A"}</strong>
                    </p>

                    {/* Dedykowany Wiersz Tablicy Rejestracyjnej */}
                    <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Tablica rejestracyjna:</span>
                      <LicensePlate plate={driver.assignedTruck.plate} scale={0.26} />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center gap-2 text-xs font-semibold text-zinc-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Pojazd przypisany do kierowcy</span>
                  </div>
                </div>
              </Link>
            ) : (
              <div className="w-full text-center py-12 border border-zinc-800 border-dashed rounded-2xl bg-zinc-900/20 flex flex-col items-center justify-center">
                <Truck className="w-12 h-12 text-zinc-700 mb-3" />
                <h3 className="text-sm font-bold text-zinc-400 mb-1">Brak Przypisanego Ciągnika</h3>
                <p className="text-zinc-600 text-xs">Pracownik nie ma aktualnie przypisanego pojazdu we flocie.</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Podsumowanie Osiągów (Skonsolidowany Pasek Statystyk) */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4"
      >
        <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-400" /> Podsumowanie Osiągów i Statystyk
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 text-xs">
          
          {/* Dystans Miesięczny */}
          <div className="space-y-2 border-r border-zinc-800/80 pr-4">
            <p className="text-zinc-500 font-semibold">Dystans z miesiąca</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-white">{(driver.stats.thisMonthKm || 0).toLocaleString()}</span>
              <span className="text-zinc-500 font-normal">/ {(driver.monthlyLimitKm > 0 ? driver.monthlyLimitKm : 10000).toLocaleString()} km</span>
            </div>
            <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden border border-zinc-800">
              <div 
                className="bg-amber-400 h-1.5 rounded-full" 
                style={{ width: `${Math.min(((driver.stats.thisMonthKm || 0) / (driver.monthlyLimitKm || 10000)) * 100, 100)}%` }}
              />
            </div>
          </div>

          {/* Ten rok */}
          <div className="space-y-1 border-r border-zinc-800/80 px-4">
            <p className="text-zinc-500 font-semibold">Dystans w tym roku</p>
            <p className="text-2xl font-black text-white">
              {(driver.stats.thisYearKm || 0).toLocaleString()} <span className="text-xs font-normal text-zinc-500">km</span>
            </p>
          </div>

          {/* Łączny Dystans */}
          <div className="space-y-1 border-r border-zinc-800/80 px-4">
            <p className="text-zinc-500 font-semibold">Łączny dystans (BMS)</p>
            <p className="text-2xl font-black text-white">
              {(driver.stats.totalJobsKm || 0).toLocaleString()} <span className="text-xs font-normal text-zinc-500">km</span>
            </p>
          </div>

          {/* Ilość dostaw */}
          <div className="space-y-1 border-r border-zinc-800/80 px-4">
            <p className="text-zinc-500 font-semibold">Zrealizowane dostawy</p>
            <p className="text-2xl font-black text-white">
              {driver.stats.jobsCount || 0}
            </p>
          </div>

          {/* Średnia trasa */}
          <div className="space-y-1 pl-4">
            <p className="text-zinc-500 font-semibold">Średnia trasa</p>
            <p className="text-2xl font-black text-white">
              {(Math.round(driver.stats.averageRouteLength) || 0).toLocaleString()} <span className="text-xs font-normal text-zinc-500">km</span>
            </p>
          </div>

        </div>
      </motion.div>

      {/* Dolna Sekcja: Spotify, Kadry, Ostatnie Trasy */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* 🎵 Spotify Track */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-zinc-950 border border-zinc-800 p-6 rounded-3xl shadow-sm flex flex-col space-y-4"
        >
          <h3 className="text-xs font-bold flex items-center gap-2 text-zinc-300 uppercase tracking-wider">
            <Music className="w-4 h-4 text-emerald-400" />
            Ulubiony Utwór (Spotify)
          </h3>
          {driver.spotifyUrl && getSpotifyEmbed(driver.spotifyUrl) ? (
            <div className="w-full h-[352px] relative rounded-2xl overflow-hidden bg-zinc-950">
              <iframe 
                src={getSpotifyEmbed(driver.spotifyUrl)} 
                width="100%" 
                height="100%" 
                frameBorder="0" 
                allowFullScreen="" 
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
                loading="lazy"
                className="absolute inset-0 w-full h-full border-0 rounded-2xl"
              />
            </div>
          ) : (
            <div className="py-8 text-center text-zinc-500 text-xs border border-zinc-800 border-dashed rounded-2xl bg-zinc-900/30 flex-1 flex items-center justify-center">
               Brak podlinkowanego utworu Spotify.
            </div>
          )}
        </motion.div>

        {/* 📋 Informacje Kadrowe */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-zinc-950 border border-zinc-800 p-6 rounded-3xl shadow-sm flex flex-col justify-between space-y-4"
        >
          <h3 className="text-xs font-bold flex items-center gap-2 text-zinc-300 uppercase tracking-wider">
            <User className="w-4 h-4 text-zinc-400" />
            Informacje Kadrowe
          </h3>
          
          <div className="space-y-3 text-xs flex-1">
            <div className="flex justify-between items-center pb-2.5 border-b border-zinc-800/80">
              <span className="text-zinc-400 flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-zinc-500"/> W firmie od</span>
              <span className="font-bold text-white">{formatDate(driver.createdAt)}</span>
            </div>
            <div className="flex justify-between items-center pb-2.5 border-b border-zinc-800/80">
              <span className="text-zinc-400 flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-zinc-500"/> Umowa</span>
              <span className="font-bold text-white">{driver.contractType || "Umowa o pracę"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400"/> Okres próbny</span>
              <span className="font-bold text-emerald-400 uppercase">{driver.probationPeriod || "SKOŃCZONY"}</span>
            </div>
          </div>
        </motion.div>

        {/* ⏱️ Ostatnie Zrealizowane Trasy */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-zinc-950 border border-zinc-800 rounded-3xl shadow-sm flex flex-col overflow-hidden"
        >
          <div className="p-4 px-6 border-b border-zinc-800/80">
            <h3 className="text-xs font-bold flex items-center gap-2 text-zinc-300 uppercase tracking-wider">
              <Clock className="w-4 h-4 text-amber-400" />
              Ostatnie Zrealizowane Trasy
            </h3>
          </div>
          
          <div className="p-4 flex-1 flex flex-col overflow-y-auto max-h-[352px]">
            {driver.recentJobs && driver.recentJobs.length > 0 ? (
              <div className="divide-y divide-zinc-800/60">
                {driver.recentJobs.map(job => (
                  <div key={job.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-white">{job.startCity} <span className="text-zinc-500 font-normal">→</span> {job.endCity}</p>
                      <p className="text-[10px] text-zinc-500">{new Date(job.date).toLocaleDateString("pl-PL")}</p>
                    </div>
                    <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      +{job.distance} km
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-xs text-zinc-500">
                 Brak zarejestrowanych tras w historii.
              </div>
            )}
          </div>
        </motion.div>

      </div>
      
      <AnimatePresence>
        {confirmConfig && (
          <ConfirmModal
            isOpen={true}
            onClose={() => setConfirmConfig(null)}
            onConfirm={confirmConfig.onConfirm}
            title={confirmConfig.title}
            message={confirmConfig.message}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
