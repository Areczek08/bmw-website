"use client";
import { toast } from "sonner";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { 
  Send, 
  MessageSquare, 
  Image as ImageIcon, 
  X, 
  Mic, 
  MicOff, 
  Reply, 
  Smile, 
  Play, 
  Pause, 
  ChevronDown, 
  AtSign 
} from "lucide-react";

// 🎙️ DEDYKOWANY (ADDONOWY) ODTWARZACZ GŁOSÓWEK
function CustomAudioPlayer({ src, isMe }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const toggleRate = () => {
    const rates = [1, 1.5, 2];
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatTime = (secs) => {
    if (isNaN(secs) || secs <= 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Wizualizacja paska fali dźwiękowej (waveform)
  const bars = [35, 75, 45, 90, 60, 30, 85, 50, 95, 40, 70, 55, 80, 35, 65, 90, 50, 40];

  return (
    <div className={`mt-2 flex items-center gap-3 p-2.5 px-3.5 rounded-2xl border shadow-md w-64 max-w-full transition-all ${
      isMe 
        ? "bg-blue-700/90 border-blue-400/40 text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)]" 
        : "bg-zinc-900/90 border-zinc-700/80 text-zinc-100 shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
    }`}>
      <audio 
        ref={audioRef} 
        src={src} 
        preload="none"
        onTimeUpdate={handleTimeUpdate} 
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      {/* Przycisk Odtwarzaj / Pauza */}
      <button 
        onClick={togglePlay} 
        type="button"
        className={`p-2.5 rounded-xl flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-sm ${
          isMe ? "bg-white text-blue-600 hover:bg-blue-50" : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-bold"
        }`}
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>

      {/* Fala Dźwiękowa i Postęp */}
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        <div 
          className="flex items-center gap-0.5 h-6 cursor-pointer relative" 
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            if (audioRef.current && duration > 0) {
              audioRef.current.currentTime = pos * duration;
            }
          }}
        >
          {bars.map((h, i) => {
            const progress = duration > 0 ? (currentTime / duration) : 0;
            const barProgress = i / bars.length;
            const active = barProgress <= progress;
            return (
              <div 
                key={i} 
                className={`flex-1 rounded-full transition-all ${
                  active 
                    ? (isMe ? "bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]" : "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]") 
                    : (isMe ? "bg-blue-300/40" : "bg-zinc-700")
                }`}
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>

        <div className="flex justify-between items-center text-[10px] font-mono opacity-80">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Prędkość Odtwarzania */}
      <button 
        type="button"
        onClick={toggleRate}
        className={`text-[10px] font-bold px-1.5 py-1 rounded-md shrink-0 border transition-colors ${
          isMe 
            ? "bg-blue-800/60 border-blue-400/40 hover:bg-blue-800 text-white" 
            : "bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-300"
        }`}
      >
        {playbackRate}x
      </button>
    </div>
  );
}

export default function ChatPage() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [image, setImage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [replyToMsg, setReplyToMsg] = useState(null);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [showEmojiPickerFor, setShowEmojiPickerFor] = useState(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  // Lista użytkowników do oznaczania po @
  const [drivers, setDrivers] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  const chatContainerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const inputRef = useRef(null);

  const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👏"];

  // Pobranie listy kierowców do autouzupełniania @mentions
  useEffect(() => {
    fetch("/api/drivers")
      .then(res => res.json())
      .then(d => {
        if (d.drivers) setDrivers(d.drivers);
      })
      .catch(() => {});
  }, []);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Plik za duży (max 5MB)");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          setAudioBlob(reader.result); // base64
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      toast.info("Brak dostępu do mikrofonu.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const cancelRecording = () => {
    setAudioBlob(null);
  };

  const lastMessageIdRef = useRef(null);
  const isFetchingRef = useRef(false);

  const fetchMessages = async (forceFull = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const lastId = forceFull ? null : lastMessageIdRef.current;
      const url = lastId ? `/api/chat?after=${lastId}` : "/api/chat";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          if (!lastId || forceFull) {
            setMessages(data);
            if (data.length > 0) {
              lastMessageIdRef.current = data[data.length - 1].id;
            }
          } else if (data.length > 0) {
            setMessages(prev => {
              const existingIds = new Set(prev.map(m => m.id));
              const newItems = data.filter(m => !existingIds.has(m.id));
              if (newItems.length === 0) return prev;
              const merged = [...prev, ...newItems];
              lastMessageIdRef.current = merged[merged.length - 1].id;
              return merged;
            });
          }
        }
      }
    } catch (e) {
      console.error("Błąd pobierania wiadomości:", e);
    } finally {
      isFetchingRef.current = false;
    }
  };

  const pingHeartbeat = () => {
    fetch("/api/user/heartbeat", { method: "PUT" }).catch(() => {});
  };

  useEffect(() => {
    fetchMessages(true);
    pingHeartbeat();
    const interval = setInterval(() => fetchMessages(false), 8000);
    const heartbeatInterval = setInterval(pingHeartbeat, 60000);
    return () => {
      clearInterval(interval);
      clearInterval(heartbeatInterval);
    };
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto"
      });
    }
  }, []);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const isFarFromBottom = scrollHeight - scrollTop - clientHeight > 250;
    setShowScrollBottomBtn(isFarFromBottom);
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 350;
      
      if (isInitialLoad || isNearBottom) {
        scrollToBottom(!isInitialLoad);
      }
      
      if (messages.length > 0 && isInitialLoad) {
        setIsInitialLoad(false);
      }
    }
  }, [messages, isInitialLoad, scrollToBottom]);

  // Obsługa wpisywania tekstu i detekcji @
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);

    const lastAtPos = val.lastIndexOf("@");
    if (lastAtPos !== -1) {
      const textAfterAt = val.slice(lastAtPos + 1);
      if (!textAfterAt.includes(" ")) {
        setMentionQuery(textAfterAt.toLowerCase());
        setSelectedMentionIndex(0);
        return;
      }
    }
    setMentionQuery(null);
  };

  const filteredMentionDrivers = drivers.filter(d => {
    if (!mentionQuery) return true;
    const nameStr = (d.firstName || d.name || "").toLowerCase();
    const nickStr = (d.discordNick || "").toLowerCase();
    return nameStr.includes(mentionQuery) || nickStr.includes(mentionQuery);
  }).slice(0, 5);

  const insertMention = (driver) => {
    const displayName = driver.firstName || driver.discordNick || driver.name;
    const lastAtPos = input.lastIndexOf("@");
    if (lastAtPos !== -1) {
      const newInput = input.slice(0, lastAtPos) + `@${displayName} `;
      setInput(newInput);
    }
    setMentionQuery(null);
    if (inputRef.current) inputRef.current.focus();
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() && !image && !audioBlob) return;

    const currentInput = input;
    const currentImage = image;
    const currentAudio = audioBlob;
    const currentReplyTo = replyToMsg?.id;

    setInput("");
    setImage("");
    setAudioBlob(null);
    setReplyToMsg(null);
    setMentionQuery(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          content: currentInput, 
          imageUrl: currentImage, 
          audioUrl: currentAudio,
          replyToId: currentReplyTo
        })
      });
      if (res.ok) {
        await fetchMessages();
        scrollToBottom(true);
      } else {
        setInput(currentInput);
        setImage(currentImage);
        setAudioBlob(currentAudio);
        toast.error("Błąd wysyłania.");
      }
    } catch (e) {
      console.error(e);
      setInput(currentInput);
    }
  };

  const handleReact = async (msgId, emoji) => {
    setShowEmojiPickerFor(null);
    const updatedMessages = messages.map(msg => {
      if (msg.id === msgId) {
        const existingReactIdx = msg.reactions?.findIndex(r => r.userId === session?.user?.id && r.emoji === emoji);
        let newReactions = [...(msg.reactions || [])];
        if (existingReactIdx >= 0) {
          newReactions.splice(existingReactIdx, 1);
        } else {
          newReactions.push({ userId: session?.user?.id, emoji });
        }
        return { ...msg, reactions: newReactions };
      }
      return msg;
    });
    setMessages(updatedMessages);

    try {
      await fetch(`/api/chat/${msgId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji })
      });
      fetchMessages();
    } catch (err) {
      console.error("React error", err);
    }
  };

  const formatMessageDate = (dateStr) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const time = d.toLocaleTimeString("pl-PL", { hour: '2-digit', minute:'2-digit' });

    if (d.toDateString() === today.toDateString()) {
      return `Dziś, ${time}`;
    } else if (d.toDateString() === yesterday.toDateString()) {
      return `Wczoraj, ${time}`;
    } else {
      return `${d.toLocaleDateString("pl-PL", { day: 'numeric', month: 'long' })}, ${time}`;
    }
  };

  const isUserOnline = (lastOnline) => {
    if (!lastOnline) return false;
    return new Date(lastOnline).getTime() > Date.now() - 5 * 60 * 1000;
  };

  // 👑 KOLORY RANG (Zarząd/Właściciel w odcieniach żółtego/złota)
  const getRankBadge = (rank, role) => {
    const r = (rank || role || "").toLowerCase();
    
    // Właściciel / Owner / Founder -> Głęboki Bursztyn/Złoto z poświatą
    if (r.includes("właściciel") || r.includes("wlasciciel") || r.includes("founder") || r.includes("owner")) {
      return "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.25)] font-extrabold";
    }
    // Prezes -> Jasny Promienisty Złoty
    if (r.includes("prezes") && !r.includes("wice")) {
      return "bg-yellow-400/20 text-yellow-300 border-yellow-400/40 shadow-[0_0_10px_rgba(250,204,21,0.2)] font-bold";
    }
    // Wiceprezes / Zastępca -> Ciepły Słoneczny Żółty
    if (r.includes("wiceprezes") || r.includes("zastępca") || r.includes("zastepca") || r.includes("vice")) {
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/40 font-bold";
    }
    // Zarząd / Manager -> Złoty Akcent
    if (r.includes("zarząd") || r.includes("zarzad") || r.includes("manager") || r.includes("szef")) {
      return "bg-amber-400/20 text-amber-400 border-amber-400/40 font-semibold";
    }
    // Dyspozytor -> Eleganckie Indygo
    if (r.includes("dyspozytor")) {
      return "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-medium";
    }
    // Kierowca -> Szmaragdowa Zieleń
    if (r.includes("kierowca") || r.includes("driver")) {
      return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-medium";
    }
    // Rekrut / Inni -> Stonowany Zinc
    return "bg-zinc-800 text-zinc-400 border-zinc-700 font-medium";
  };

  // Renderowanie wiadomości z podświetlaniem wzmianek po @
  const renderMessageContent = (content, isMe) => {
    if (!content) return null;
    const myName = (session?.user?.name || session?.user?.firstName || "").toLowerCase();
    
    // Split content by mentions pattern `@Word`
    const parts = content.split(/(@[A-Za-z0-9ĄĆĘŁŃÓŚŹŻąćęłńóśźż_]+)/g);

    return (
      <p className="whitespace-pre-wrap leading-relaxed">
        {parts.map((part, idx) => {
          if (part.startsWith("@")) {
            const mentionedName = part.slice(1).toLowerCase();
            const isMentionedMe = myName && (myName.includes(mentionedName) || mentionedName.includes(myName));

            return (
              <span 
                key={idx} 
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-md font-bold text-xs border shadow-sm ${
                  isMentionedMe 
                    ? "bg-amber-400 text-zinc-950 border-amber-300 animate-pulse shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                    : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                }`}
              >
                <AtSign className="w-3 h-3 inline shrink-0" />
                {part.slice(1)}
              </span>
            );
          }
          return part;
        })}
      </p>
    );
  };

  // Grupowanie reakcji
  const renderReactions = (reactions, msgId) => {
    if (!reactions || reactions.length === 0) return null;
    const grouped = reactions.reduce((acc, r) => {
      acc[r.emoji] = (acc[r.emoji] || 0) + 1;
      return acc;
    }, {});

    return (
      <div className="flex flex-wrap gap-1 mt-1.5">
        {Object.entries(grouped).map(([emoji, count]) => (
          <button 
            key={emoji} 
            onClick={() => handleReact(msgId, emoji)}
            className="text-[11px] bg-black/20 dark:bg-white/10 border border-white/10 px-2 py-0.5 rounded-full hover:bg-white/20 transition-colors flex items-center gap-1"
          >
            <span>{emoji}</span>
            {count > 1 && <span className="font-bold opacity-80">{count}</span>}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-12rem)] min-h-[600px] flex flex-col bg-zinc-900 border border-zinc-800 rounded-3xl shadow-xl overflow-hidden relative">
      
      {/* Fullscreen Image Modal */}
      {fullscreenImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-md" onClick={() => setFullscreenImage(null)}>
          <img src={fullscreenImage} alt="Fullscreen" className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" />
          <button className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-extrabold text-lg leading-tight text-white flex items-center gap-2">
              Czat Firmowy
            </h2>
            <p className="text-xs text-zinc-400">Komunikacja na żywo zespołu BMS</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-xs text-zinc-400 font-medium">Na żywo</span>
        </div>
      </div>

      {/* Messages Box with Custom Scrollbar */}
      <div 
        ref={chatContainerRef} 
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-6 bg-zinc-950/50 relative"
      >
        {messages.length === 0 ? (
          <div className="text-center text-zinc-500 mt-16 font-medium">Brak wiadomości. Napisz pierwszy na czacie!</div>
        ) : (
          messages.map(msg => {
            const isMe = msg.user?.name === session?.user?.name;
            const online = isUserOnline(msg.user?.lastOnline);
            const myName = (session?.user?.name || session?.user?.firstName || "").toLowerCase();
            const isMentioned = msg.content && myName && msg.content.toLowerCase().includes(`@${myName}`);

            return (
              <div key={msg.id} className={`flex gap-3 group ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                <div className="relative shrink-0 flex items-end">
                  <div className="w-10 h-10 rounded-2xl overflow-hidden bg-zinc-800 border border-zinc-700 flex items-center justify-center shadow-md">
                    {msg.user?.image ? (
                      <img src={msg.user?.image} alt="Avatar" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-300 font-bold text-sm uppercase">
                        {(msg.user?.firstName || msg.user?.name || "?").charAt(0)}
                      </div>
                    )}
                  </div>
                  {online && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-zinc-900 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                  )}
                </div>

                {/* Message Content */}
                <div className={`flex flex-col max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                  
                  {/* Name & Time */}
                  <div className={`flex items-baseline gap-2 mb-1 px-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                    <span className="text-[13px] font-bold text-zinc-200">
                      {msg.user?.firstName || msg.user?.name}
                    </span>
                    <span className={`text-[10px] border px-2 py-0.5 rounded-full ${getRankBadge(msg.user?.rank, msg.user?.role)}`}>
                      {msg.user?.rank || msg.user?.role}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-medium">
                      {formatMessageDate(msg.createdAt)}
                    </span>
                  </div>

                  {/* Bubble Container */}
                  <div className="relative group/bubble flex items-center gap-2">
                    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      
                      {/* Quoted Reply */}
                      {msg.replyTo && (
                        <div className={`mb-1 p-2 px-3 rounded-xl text-xs bg-zinc-900/90 border-l-4 border-blue-500 flex flex-col gap-0.5 max-w-full overflow-hidden shadow-sm`}>
                          <span className="font-bold text-blue-400">{msg.replyTo.user?.firstName || msg.replyTo.user?.name}</span>
                          <span className="truncate text-zinc-300 opacity-90">{msg.replyTo.content || "Załącznik"}</span>
                        </div>
                      )}

                      {/* Main Message Bubble */}
                      <div className={`px-4 py-3 rounded-2xl text-[14px] leading-relaxed break-words relative shadow-md transition-all
                        ${isMe 
                          ? 'bg-blue-600 text-white rounded-br-sm' 
                          : 'bg-zinc-800/90 border border-zinc-700/80 rounded-bl-sm text-zinc-100'
                        }
                        ${isMentioned ? 'border-amber-400/60 ring-2 ring-amber-400/30 bg-amber-950/30 shadow-[0_0_20px_rgba(245,158,11,0.2)]' : ''}
                      `}
                      >
                        {msg.content && renderMessageContent(msg.content, isMe)}
                        
                        {msg.imageUrl && (
                          <img 
                            src={msg.imageUrl} 
                            alt="attachment" 
                            loading="lazy"
                            decoding="async"
                            onClick={() => setFullscreenImage(msg.imageUrl)}
                            className="mt-2.5 rounded-xl max-w-full h-auto max-h-60 object-cover cursor-zoom-in hover:opacity-95 transition-opacity border border-white/10 shadow-md" 
                          />
                        )}

                        {/* Custom Addon Audio Player */}
                        {msg.audioUrl && (
                          <CustomAudioPlayer src={msg.audioUrl} isMe={isMe} />
                        )}
                      </div>

                      {renderReactions(msg.reactions, msg.id)}
                    </div>

                    {/* Actions Menu (Hover) */}
                    <div className={`flex gap-1 opacity-0 group-hover/bubble:opacity-100 transition-opacity absolute ${isMe ? '-left-20' : '-right-20'} top-1/2 -translate-y-1/2 z-10`}>
                      <button 
                        type="button"
                        onClick={() => setShowEmojiPickerFor(showEmojiPickerFor === msg.id ? null : msg.id)}
                        className="p-2 bg-zinc-800 border border-zinc-700 rounded-full shadow-lg hover:bg-zinc-700 transition-colors text-zinc-300 relative"
                      >
                        <Smile className="w-4 h-4" />
                        {showEmojiPickerFor === msg.id && (
                          <div className={`absolute top-9 ${isMe ? 'right-0' : 'left-0'} bg-zinc-900 border border-zinc-700 shadow-2xl rounded-2xl p-2 flex gap-1.5 z-30`}>
                            {EMOJIS.map(e => (
                              <div key={e} onClick={(ev) => { ev.stopPropagation(); handleReact(msg.id, e); }} className="cursor-pointer hover:bg-zinc-800 p-2 rounded-xl text-lg transition-transform hover:scale-125">
                                {e}
                              </div>
                            ))}
                          </div>
                        )}
                      </button>
                      <button 
                        type="button"
                        onClick={() => setReplyToMsg(msg)}
                        className="p-2 bg-zinc-800 border border-zinc-700 rounded-full shadow-lg hover:bg-zinc-700 transition-colors text-zinc-300"
                      >
                        <Reply className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottomBtn && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-24 right-6 z-20 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full shadow-xl border border-white/20 transition-all animate-bounce flex items-center gap-2 text-xs font-bold"
        >
          <ChevronDown className="w-4 h-4" /> Najnowsze wiadomości
        </button>
      )}

      {/* Input Area */}
      <div className="p-4 bg-zinc-900 border-t border-zinc-800 shrink-0 relative">
        
        {/* Mention Autocomplete Popup */}
        {mentionQuery !== null && filteredMentionDrivers.length > 0 && (
          <div className="absolute bottom-full left-4 mb-2 w-72 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden z-40 p-2 space-y-1 backdrop-blur-xl">
            <div className="text-[10px] font-bold text-zinc-400 px-3 py-1 uppercase tracking-wider flex items-center gap-1 border-b border-zinc-800 mb-1">
              <AtSign className="w-3 h-3 text-amber-400" /> Oznacz członka zespołu
            </div>
            {filteredMentionDrivers.map((driver, idx) => {
              const displayName = driver.firstName || driver.discordNick || driver.name;
              return (
                <button
                  key={driver.id || idx}
                  type="button"
                  onClick={() => insertMention(driver)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-colors ${
                    idx === selectedMentionIndex ? "bg-blue-600 text-white" : "hover:bg-zinc-800 text-zinc-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg overflow-hidden bg-zinc-800 border border-white/10 shrink-0 flex items-center justify-center font-bold text-xs">
                      {driver.image ? <img src={driver.image} alt={displayName} className="w-full h-full object-cover" /> : displayName.charAt(0)}
                    </div>
                    <div className="truncate text-xs">
                      <span className="font-bold block truncate">{displayName}</span>
                      {driver.discordNick && <span className="text-[10px] opacity-70 block truncate">@{driver.discordNick}</span>}
                    </div>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full uppercase border shrink-0 ${getRankBadge(driver.rank, driver.role)}`}>
                    {driver.rank || driver.role}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Reply Preview */}
        {replyToMsg && (
          <div className="mb-3 px-4 py-2.5 bg-blue-950/40 border border-blue-500/30 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="flex flex-col overflow-hidden text-xs">
              <span className="font-bold text-blue-400">Odpowiadasz użytkownikowi: {replyToMsg.user?.firstName || replyToMsg.user?.name}</span>
              <span className="text-zinc-300 truncate">{replyToMsg.content || "Załącznik"}</span>
            </div>
            <button onClick={() => setReplyToMsg(null)} className="p-1 text-zinc-400 hover:text-red-400 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Attachment Previews */}
        {(image || audioBlob) && (
          <div className="mb-3 flex gap-3">
            {image && (
              <div className="relative inline-block group">
                <img src={image} alt="preview" className="h-16 w-16 object-cover rounded-2xl border border-zinc-700 shadow-md" />
                <button onClick={() => setImage("")} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {audioBlob && (
              <div className="relative flex items-center bg-zinc-800 rounded-2xl p-2 border border-zinc-700 shadow-md">
                <CustomAudioPlayer src={audioBlob} isMe={true} />
                <button onClick={cancelRecording} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={sendMessage} className="flex gap-2.5 items-center">
          
          <label className="cursor-pointer p-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-2xl transition-colors text-zinc-400 hover:text-blue-400 shrink-0">
            <ImageIcon className="w-5 h-5" />
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>

          <div className="flex-1 relative flex items-center">
            <input 
              ref={inputRef}
              type="text"
              value={input}
              onChange={handleInputChange}
              placeholder={isRecording ? "Nagrywanie dźwięku..." : "Napisz wiadomość... (użyj @ aby oznaczyć)"}
              disabled={isRecording}
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-2xl px-5 py-3.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all disabled:opacity-50"
            />
            
            {/* Mic Toggle */}
            {!input && !image && !audioBlob && (
              <button
                type="button"
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                className={`absolute right-2.5 p-2 rounded-xl transition-colors ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'text-zinc-400 hover:bg-zinc-800 hover:text-red-400'}`}
                title="Przytrzymaj, aby nagrać głosówkę"
              >
                {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            )}
          </div>

          {(input || image || audioBlob) && (
            <button 
              type="submit"
              className="bg-blue-600 hover:bg-blue-500 text-white p-3.5 rounded-2xl transition-all flex items-center justify-center shadow-lg active:scale-95 shrink-0"
            >
              <Send className="w-5 h-5" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
