'use client';

import React from 'react';
import ActionModal from "@/components/ui/action-modal";
import { PlatformLanguage, cropList, cropLabels, ui } from "@/lib/i18n";

interface PlotModalsProps {
  language: PlatformLanguage;
  isPoleOpen: boolean;
  setIsPoleOpen: (v: boolean) => void;
  isEditModalOpen: boolean;
  setIsEditModalOpen: (v: boolean) => void;
  isSubmitting: boolean;
  fieldName: string;
  setFieldName: (v: string) => void;
  selectedCrop: string;
  setSelectedCrop: (v: string) => void;
  fillColor: string;
  setFillColor: (v: string) => void;
  areaSizeHectares: number;
  submitPlot: () => Promise<void>;
  updatePlot: () => Promise<void>;
  children?: React.ReactNode; // For the WorkspaceSheet
}

export default function PlotModals({
  language,
  isPoleOpen,
  setIsPoleOpen,
  isEditModalOpen,
  setIsEditModalOpen,
  isSubmitting,
  fieldName,
  setFieldName,
  selectedCrop,
  setSelectedCrop,
  fillColor,
  setFillColor,
  areaSizeHectares,
  submitPlot,
  updatePlot,
  children
}: PlotModalsProps) {
  const t = ui[language] || ui.ru;

  return (
    <>
      <ActionModal
        isOpen={isPoleOpen}
        onClose={() => setIsPoleOpen(false)}
        title={t.newField || "Новый участок"}
        primaryActionText={isSubmitting ? t.saving || "Сохранение..." : t.save || "Сохранить"}
        onPrimaryAction={submitPlot}
        language={language}
      >
        <p className="mb-4 text-[#2F6B3D] font-bold opacity-70">
          {t.chooseCrop || "Конфигурация"}
        </p>
        <div className="mb-2 flex flex-col gap-3">
          <div>
            <label className="ml-1 text-[10px] font-black uppercase text-[#2F6B3D]/50">
              {t.fieldName || "Название"}
            </label>
            <input
              type="text"
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              className="h-14 w-full rounded-2xl bg-[#F5F9F4] px-4 font-bold text-[#2F6B3D] shadow-inner focus:outline-none"
            />
          </div>
          <div>
            <label className="ml-1 text-[10px] font-black uppercase text-[#2F6B3D]/50">
              Культура
            </label>
            <select
              className="h-14 w-full rounded-2xl bg-[#F5F9F4] px-4 font-bold text-[#2F6B3D] shadow-inner focus:outline-none"
              value={selectedCrop}
              onChange={(e) => setSelectedCrop(e.target.value)}
            >
              {cropList.map((crop) => (
                <option key={crop.key} value={(cropLabels[language] as any)[crop.key]}>
                  {crop.emoji} {(cropLabels[language] as any)[crop.key]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="ml-1 text-[10px] font-black uppercase text-[#2F6B3D]/50">
              Цвет культуры
            </label>
            <input
              type="color"
              className="h-10 w-full cursor-pointer appearance-none rounded-xl border-none bg-transparent p-0"
              value={fillColor}
              onChange={(e) => setFillColor(e.target.value)}
            />
          </div>
          <div className="rounded-2xl bg-[#F5F9F4] px-4 py-3 text-sm font-bold text-[#2F6B3D] shadow-inner">
            {t.area || "Площадь"}: {areaSizeHectares.toFixed(2)} {t.hectares || "га"}
          </div>
        </div>
      </ActionModal>

      <ActionModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Редактирование участка"
        primaryActionText={isSubmitting ? "Сохранение..." : "Сохранить"}
        onPrimaryAction={updatePlot}
        language={language}
      >
        <p className="mb-4 text-[#2F6B3D] font-bold opacity-70">
          Измените данные выделенного участка:
        </p>
        {children}
      </ActionModal>
    </>
  );
}
