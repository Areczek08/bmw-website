"use client";

import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw } from "lucide-react";

export function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = "Tak, potwierdzam", 
  cancelText = "Anuluj",
  isLoading = false 
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={isLoading ? undefined : onClose}
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }} 
        animate={{ opacity: 1, scale: 1, y: 0 }} 
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center"
      >
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
        <p className="text-zinc-400 mb-8">{message}</p>
        
        <div className="flex gap-4">
          <button 
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="flex-1 py-3 px-4 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-xl font-bold transition-colors"
          >
            {cancelText}
          </button>
          <button 
            type="button"
            disabled={isLoading}
            onClick={async () => {
              if (isLoading) return;
              await onConfirm();
            }}
            className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl font-bold shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all flex items-center justify-center gap-2"
          >
            {isLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
            <span>{isLoading ? "Przetwarzanie..." : confirmText}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
