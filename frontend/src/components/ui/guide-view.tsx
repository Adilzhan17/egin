"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  BookOpen, 
  Map as MapIcon, 
  MousePointer2, 
  Sparkles, 
  TrendingUp, 
  X,
  ChevronRight,
  Target,
  Layers,
  ArrowRight
} from "lucide-react";
import { PlatformLanguage } from "@/lib/i18n";

interface GuideViewProps {
  language: PlatformLanguage;
  onClose: () => void;
}

export default function GuideView({ language, onClose }: GuideViewProps) {
  const isKk = language === "kk";

  const steps = [
    {
      title: isKk ? "Аймақты таңдау" : "Выбор региона",
      description: isKk 
        ? "Картадан өз аймағыңызды табыңыз. Біз Қазақстанның барлық дерлік облыстары бойынша деректерді жинаймыз." 
        : "Найдите свой регион на карте. Мы собираем данные по большинству областей Казахстана.",
      icon: MapIcon,
      color: "bg-blue-500",
    },
    {
      title: isKk ? "Учаскені сызу" : "Рисование участка",
      description: isKk 
        ? "Сол жақтағы құралдар панелін пайдаланып, егістік алқабыңыздың шекарасын дәл сызыңыз." 
        : "Используйте панель инструментов слева, чтобы точно очертить границы вашего поля.",
      icon: MousePointer2,
      color: "bg-green-500",
    },
    {
      title: isKk ? "AI талдау" : "AI Аналитика",
      description: isKk 
        ? "Сақталғаннан кейін біздің AI аймақтағы топырақты, ауа райын және бәсекені ескере отырып, ең тиімді дақылдарды ұсынады." 
        : "После сохранения наш AI предложит самые выгодные культуры, учитывая почву, погоду и конкуренцию в регионе.",
      icon: Sparkles,
      color: "bg-amber-500",
    },
    {
      title: isKk ? "Нарықты бақылау" : "Мониторинг рынка",
      description: isKk 
        ? "Маркет бөлімінде өнімдердің ағымдағы бағаларын, сұранысын және логистикалық мүмкіндіктерін қараңыз." 
        : "В разделе Маркет смотрите актуальные цены, спрос и логистические возможности для вашей продукции.",
      icon: TrendingUp,
      color: "bg-indigo-500",
    },
  ];

  return (
    <div className="absolute inset-0 z-[70] flex flex-col bg-[#EAF3E7] dark:bg-[#002115] transition-colors p-6 overflow-y-auto animate-in fade-in slide-in-from-bottom-8 duration-500">
      <div className="mx-auto w-full max-w-2xl pt-10 pb-32">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#17381C] text-white shadow-lg">
              <BookOpen className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-[#17381C] dark:text-white">
                {isKk ? "Пайдалану нұсқаулығы" : "Руководство пользователя"}
              </h1>
              <p className="text-sm font-medium text-[#17381C]/60 dark:text-white/60 uppercase tracking-widest">
                EGIN-KZ PLATFORM
              </p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="rounded-full h-12 w-12 hover:bg-black/5 dark:hover:bg-white/10 dark:text-white"
          >
            <X className="size-6" />
          </Button>
        </div>

        <div className="space-y-6">
          {steps.map((step, idx) => (
            <Card key={idx} className="group relative overflow-hidden border-none bg-white dark:bg-white/5 p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-none transition-all hover:shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
              <div className="flex gap-5">
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] ${step.color} text-white shadow-lg shadow-${step.color.split('-')[1]}-500/20`}>
                  <step.icon className="size-7" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-black tracking-tight text-[#17381C] dark:text-white">
                      {step.title}
                    </h3>
                    <span className="text-[10px] font-black text-[#17381C]/20 dark:text-white/20">0{idx + 1}</span>
                  </div>
                  <p className="text-sm font-medium leading-relaxed text-[#17381C]/70 dark:text-white/70">
                    {step.description}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-12 rounded-[2rem] bg-[#17381C] p-8 text-white shadow-2xl">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
              <Target className="size-5" />
            </div>
            <div>
              <h4 className="text-lg font-bold mb-2">
                {isKk ? "Біздің мақсатымыз" : "Наша цель"}
              </h4>
              <p className="text-sm text-white/70 leading-relaxed font-medium">
                {isKk 
                  ? "Қазақстанның әрбір фермеріне заманауи технологиялар мен деректерге негізделген шешімдерді қолжетімді ету. Өнімділікті арттыру және шығындарды азайту."
                  : "Сделать современные технологии и решения на основе данных доступными каждому фермеру Казахстана. Повысить урожайность и снизить риски."}
              </p>
              <Button className="mt-6 bg-[#4ADE80] text-[#002115] hover:bg-[#3ecb70] rounded-full px-6 font-bold flex items-center gap-2 group transition-all" onClick={onClose}>
                {isKk ? "Жұмысты бастау" : "Начать работу"}
                <ArrowRight className="size-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
