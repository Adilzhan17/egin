import React from "react";
import { Button } from "@/components/ui/button";
import { PlatformLanguage, ui } from "@/lib/i18n";

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  primaryActionText: string;
  onPrimaryAction: () => void;
  language: PlatformLanguage;
}

export default function ActionModal({
  isOpen,
  onClose,
  title,
  children,
  primaryActionText,
  onPrimaryAction,
  language,
}: ActionModalProps) {
  const t = ui[language];
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-3 pb-28 sm:pb-3">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal Box */}
      <div className="relative z-10 flex max-h-[calc(100dvh-7.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl animate-in zoom-in-95 fade-in duration-200 sm:max-h-[90vh]">
        <div className="px-6 pt-6">
          <h2 className="mb-4 text-xl font-bold text-foreground">{title}</h2>
        </div>
        
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 text-sm text-muted-foreground">
          {children}
        </div>

        <div className="flex gap-3 border-t border-black/5 bg-white px-6 py-4">
          <Button 
            variant="outline" 
            className="flex-1 rounded-xl h-12" 
            onClick={onClose}
          >
            {t.cancel}
          </Button>
          <Button 
            className="flex-1 rounded-xl h-12 text-white" 
            onClick={() => {
              onPrimaryAction();
              onClose();
            }}
          >
            {primaryActionText}
          </Button>
        </div>
      </div>
    </div>
  );
}
