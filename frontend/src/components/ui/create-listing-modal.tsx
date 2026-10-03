"use client";

import { useState } from "react";
import { Check, Sprout, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";
import { PlatformLanguage } from "@/lib/i18n";

interface CreateListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  language: PlatformLanguage;
}

export default function CreateListingModal({
  isOpen,
  onClose,
  onSuccess,
  language,
}: CreateListingModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [marketGuidance, setMarketGuidance] = useState<{
    title?: string | null;
    message?: string | null;
    actions?: string[] | null;
  } | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    category: language === "kk" ? "Көкөніс" : "Овощи",
    cropId: language === "kk" ? "Картоп" : "Картофель",
    quantity: "",
    unit: "кг",
    price: "",
    currency: "KZT",
    location: language === "kk" ? "Алматы обл." : "Алматинская обл.",
    availableFrom: new Date().toISOString().split("T")[0],
    description: "",
    imageUrl: "",
    freshnessDays: "",
    storageLifeDays: "",
    storageConditions: "",
    deliveryAvailable: false,
    deliveryNotes: "",
    recommendedRegion: language === "kk" ? "Алматы облысы" : "Алматинская область",
    saleModel: "lead_chat",
  });
  const copy =
    language === "kk"
      ? {
          needLogin: "Жүйеге кіріңіз",
          hidden:
            "Жарияланым жасалды. Жүйе нарық қызығушылығы төмен болуы мүмкін екенін ескертті.",
          visible: "Жарияланым жасалды және маркетте көрініп тұр.",
          errorCreate: "Жарияланым жасау қатесі: ",
          errorSend: "Деректерді жіберу мүмкін болмады.",
          eyebrow: "Жаңа жарияланым",
          title: "Өнімді жариялау",
          smart: "Ақылды көріну",
          smartText:
            "Жарияланым жасалғаннан кейін жүйе бәсеке мен нарық қызығушылығын бағалайды. Енді жүйе автоматты түрде өшірмейді, тек ақылды ұсыныс береді.",
          fieldTitle: "Атауы",
          category: "Санат",
          crop: "Дақыл",
          quantity: "Көлем",
          price: "Баға",
          location: "Орналасу",
          available: "Қай күннен",
          description: "Сипаттама",
          image: "Фото URL",
          freshness: "Балғындық күні",
          storageLife: "Сақтау күні",
          storageConditions: "Сақтау шарты",
          delivery: "Жеткізу",
          deliveryNotes: "Жеткізу шарты",
          recommendedRegion: "Ұсынылатын өңір",
          saleModel: "Сату моделі",
          yes: "Иә",
          no: "Жоқ",
          publishing: "Жариялануда...",
          publish: "Жариялау",
          vegetables: "Көкөніс",
          fruits: "Жеміс",
          grains: "Дәнді",
          other: "Басқа",
          titlePlaceholder: "Мысалы: Іріктелген картоп",
          locationPlaceholder: "Алматы обл, Талғар",
          descriptionPlaceholder: "Сапа, сақтау және жеткізу туралы қосымша мәлімет...",
          imagePlaceholder: "https://...",
          storagePlaceholder: "Көлеңкеде және салқын жерде сақтау",
          deliveryPlaceholder: "Қай аймаққа және қанша уақытта жеткізесіз",
        }
      : {
          needLogin: "Пожалуйста, войдите в систему",
          hidden:
            "Объявление создано. Система предупредила, что рыночный интерес может быть низким.",
          visible: "Объявление создано и доступно в общем маркетплейсе.",
          errorCreate: "Ошибка при создании объявления: ",
          errorSend: "Не удалось отправить данные.",
          eyebrow: "Новое объявление",
          title: "Публикация из хозяйства",
          smart: "Умная видимость",
          smartText:
            "После публикации система оценивает конкуренцию и рыночный интерес. Теперь позиция не скрывается автоматически, а получает умную рекомендацию.",
          fieldTitle: "Название",
          category: "Категория",
          crop: "Культура",
          quantity: "Объем",
          price: "Цена",
          location: "Локация",
          available: "Доступно с",
          description: "Описание",
          image: "Фото URL",
          freshness: "Свежесть, дней",
          storageLife: "Срок хранения, дней",
          storageConditions: "Условия хранения",
          delivery: "Доставка",
          deliveryNotes: "Условия доставки",
          recommendedRegion: "Регион рекомендации",
          saleModel: "Модель продажи",
          yes: "Да",
          no: "Нет",
          publishing: "Публикуем...",
          publish: "Опубликовать",
          vegetables: "Овощи",
          fruits: "Фрукты",
          grains: "Зерновые",
          other: "Прочее",
          titlePlaceholder: "Например: Отборный картофель",
          locationPlaceholder: "Алматинская обл, Талгар",
          descriptionPlaceholder: "Дополнительные детали по качеству, хранению и логистике...",
          imagePlaceholder: "https://...",
          storagePlaceholder: "Хранить в тени и прохладе",
          deliveryPlaceholder: "Куда и за сколько доставляете",
        };

  if (!isOpen) return null;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const target = e.target;
    const value =
      target instanceof HTMLInputElement && target.type === "checkbox"
        ? target.checked
        : target.value;
    setFormData((prev) => ({ ...prev, [target.name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const token = localStorage.getItem("agro_token");
      if (!token) {
        alert(copy.needLogin);
        return;
      }

      const res = await fetch(apiUrl("/marketplace/listings"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
          quantity: Number(formData.quantity),
          price: Number(formData.price),
          freshnessDays: formData.freshnessDays
            ? Number(formData.freshnessDays)
            : undefined,
          storageLifeDays: formData.storageLifeDays
            ? Number(formData.storageLifeDays)
            : undefined,
        }),
      });

      const json = await res.json();

      if (res.ok && json) {
        const visibilityStatus = json.visibilityStatus as string | undefined;
        const visibilityReason = json.visibilityReason as string | undefined;
        const recommendationTitle = json.recommendationTitle as string | undefined;
        const recommendationMessage = json.recommendationMessage as string | undefined;
        const recommendedActions = json.recommendedActions as string[] | undefined;

        setMarketGuidance({
          title: recommendationTitle,
          message: recommendationMessage || visibilityReason,
          actions: recommendedActions || [],
        });

        if (visibilityStatus === "hidden") {
          alert(visibilityReason || copy.hidden);
        } else if (visibilityStatus === "visible") {
          alert(
            recommendationMessage ||
              visibilityReason ||
              copy.visible,
          );
        }

        onSuccess();
        onClose();
      } else {
        alert(copy.errorCreate + (json.message || res.statusText));
      }
    } catch {
      alert(copy.errorSend);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-[#F4EFE6] shadow-[0_30px_100px_rgba(13,30,17,0.3)] animate-in slide-in-from-bottom-8 duration-300">
        <div className="flex items-center justify-between border-b border-white/45 bg-white/55 px-6 py-5 backdrop-blur-xl">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#2F6B3D]/65">
              {copy.eyebrow}
            </p>
            <h2 className="mt-1 text-2xl font-black text-[#17381C]">
              {copy.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full bg-white text-[#17381C] shadow-sm transition-colors hover:bg-[#efe7d6]"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-6">
          {marketGuidance && (
            <div className="mb-5 rounded-[1.8rem] border border-[#D9B44A]/30 bg-[#FBF6E7] px-5 py-4 text-[#17381C]">
              <div className="mb-2 flex items-center gap-2">
                <Check className="size-4 text-[#A78018]" />
                <span className="text-xs font-black uppercase tracking-[0.22em] text-[#A78018]">
                  {marketGuidance.title || copy.smart}
                </span>
              </div>
              <p className="text-sm leading-relaxed">
                {marketGuidance.message}
              </p>
              {marketGuidance.actions?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {marketGuidance.actions.map((action) => (
                    <span
                      key={action}
                      className="rounded-full bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-[#17381C]"
                    >
                      {action}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          <div className="mb-5 rounded-[1.8rem] bg-[#17381C] px-5 py-4 text-white">
            <div className="mb-2 flex items-center gap-2">
              <Sprout className="size-4 text-[#D9B44A]" />
              <span className="text-xs font-black uppercase tracking-[0.22em] text-white/75">
                {copy.smart}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-white/78">
              {copy.smartText}
            </p>
          </div>

          <form id="create-listing-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="ml-2 text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                {copy.fieldTitle}
              </label>
              <input
                name="title"
                required
                value={formData.title}
                onChange={handleChange}
                className="h-14 w-full rounded-[1.4rem] border-none bg-white px-4 text-sm font-semibold text-[#17381C] shadow-sm outline-none"
                placeholder={copy.titlePlaceholder}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="ml-2 text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                  {copy.category}
                </label>
                <select
                  name="category"
                  required
                  value={formData.category}
                  onChange={handleChange}
                  className="h-14 w-full rounded-[1.4rem] border-none bg-white px-4 text-sm font-semibold text-[#17381C] shadow-sm outline-none"
                >
                  <option value={copy.vegetables}>{copy.vegetables}</option>
                  <option value={copy.fruits}>{copy.fruits}</option>
                  <option value={copy.grains}>{copy.grains}</option>
                  <option value={copy.other}>{copy.other}</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="ml-2 text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                  {copy.crop}
                </label>
                <input
                  name="cropId"
                  required
                  value={formData.cropId}
                  onChange={handleChange}
                  className="h-14 w-full rounded-[1.4rem] border-none bg-white px-4 text-sm font-semibold text-[#17381C] shadow-sm outline-none"
                  placeholder="Картофель"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="ml-2 text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                  {copy.quantity}
                </label>
                <div className="flex gap-2">
                  <input
                    name="quantity"
                    type="number"
                    required
                    min="1"
                    value={formData.quantity}
                    onChange={handleChange}
                    className="h-14 w-full rounded-[1.4rem] border-none bg-white px-4 text-sm font-semibold text-[#17381C] shadow-sm outline-none"
                    placeholder="100"
                  />
                  <select
                    name="unit"
                    value={formData.unit}
                    onChange={handleChange}
                    className="h-14 w-28 rounded-[1.4rem] border-none bg-white px-3 text-sm font-semibold text-[#17381C] shadow-sm outline-none"
                  >
                    <option value="т">тонн</option>
                    <option value="кг">кг</option>
                    <option value="шт">шт</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="ml-2 text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                  {copy.price}
                </label>
                <input
                  name="price"
                  type="number"
                  required
                  min="1"
                  value={formData.price}
                  onChange={handleChange}
                  className="h-14 w-full rounded-[1.4rem] border-none bg-white px-4 text-sm font-semibold text-[#17381C] shadow-sm outline-none"
                  placeholder="25000"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="ml-2 text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                {copy.location}
              </label>
              <input
                name="location"
                required
                value={formData.location}
                onChange={handleChange}
                className="h-14 w-full rounded-[1.4rem] border-none bg-white px-4 text-sm font-semibold text-[#17381C] shadow-sm outline-none"
                placeholder={copy.locationPlaceholder}
              />
            </div>

            <div className="space-y-1">
              <label className="ml-2 text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                {copy.available}
              </label>
              <input
                name="availableFrom"
                type="date"
                required
                value={formData.availableFrom}
                onChange={handleChange}
                className="h-14 w-full rounded-[1.4rem] border-none bg-white px-4 text-sm font-semibold text-[#17381C] shadow-sm outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="ml-2 text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                {copy.description}
              </label>
              <textarea
                name="description"
                rows={4}
                value={formData.description}
                onChange={handleChange}
                className="w-full resize-none rounded-[1.4rem] border-none bg-white p-4 text-sm font-semibold text-[#17381C] shadow-sm outline-none"
                placeholder={copy.descriptionPlaceholder}
              />
            </div>

            <div className="space-y-1">
              <label className="ml-2 text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                {copy.image}
              </label>
              <input
                name="imageUrl"
                value={formData.imageUrl}
                onChange={handleChange}
                className="h-14 w-full rounded-[1.4rem] border-none bg-white px-4 text-sm font-semibold text-[#17381C] shadow-sm outline-none"
                placeholder={copy.imagePlaceholder}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="ml-2 text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                  {copy.freshness}
                </label>
                <input
                  name="freshnessDays"
                  type="number"
                  min="0"
                  value={formData.freshnessDays}
                  onChange={handleChange}
                  className="h-14 w-full rounded-[1.4rem] border-none bg-white px-4 text-sm font-semibold text-[#17381C] shadow-sm outline-none"
                  placeholder="3"
                />
              </div>
              <div className="space-y-1">
                <label className="ml-2 text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                  {copy.storageLife}
                </label>
                <input
                  name="storageLifeDays"
                  type="number"
                  min="0"
                  value={formData.storageLifeDays}
                  onChange={handleChange}
                  className="h-14 w-full rounded-[1.4rem] border-none bg-white px-4 text-sm font-semibold text-[#17381C] shadow-sm outline-none"
                  placeholder="14"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="ml-2 text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                {copy.storageConditions}
              </label>
              <textarea
                name="storageConditions"
                rows={3}
                value={formData.storageConditions}
                onChange={handleChange}
                className="w-full resize-none rounded-[1.4rem] border-none bg-white p-4 text-sm font-semibold text-[#17381C] shadow-sm outline-none"
                placeholder={copy.storagePlaceholder}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="ml-2 text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                  {copy.delivery}
                </label>
                <select
                  name="deliveryAvailable"
                  value={formData.deliveryAvailable ? "true" : "false"}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      deliveryAvailable: e.target.value === "true",
                    }))
                  }
                  className="h-14 w-full rounded-[1.4rem] border-none bg-white px-4 text-sm font-semibold text-[#17381C] shadow-sm outline-none"
                >
                  <option value="false">{copy.no}</option>
                  <option value="true">{copy.yes}</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="ml-2 text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                  {copy.saleModel}
                </label>
                <select
                  name="saleModel"
                  value={formData.saleModel}
                  onChange={handleChange}
                  className="h-14 w-full rounded-[1.4rem] border-none bg-white px-4 text-sm font-semibold text-[#17381C] shadow-sm outline-none"
                >
                  <option value="lead_chat">Lead chat</option>
                  <option value="local_direct">Local direct</option>
                  <option value="bulk_offer">Bulk offer</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="ml-2 text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                {copy.deliveryNotes}
              </label>
              <input
                name="deliveryNotes"
                value={formData.deliveryNotes}
                onChange={handleChange}
                className="h-14 w-full rounded-[1.4rem] border-none bg-white px-4 text-sm font-semibold text-[#17381C] shadow-sm outline-none"
                placeholder={copy.deliveryPlaceholder}
              />
            </div>

            <div className="space-y-1">
              <label className="ml-2 text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                {copy.recommendedRegion}
              </label>
              <input
                name="recommendedRegion"
                value={formData.recommendedRegion}
                onChange={handleChange}
                className="h-14 w-full rounded-[1.4rem] border-none bg-white px-4 text-sm font-semibold text-[#17381C] shadow-sm outline-none"
                placeholder={copy.locationPlaceholder}
              />
            </div>
          </form>
        </div>

        <div className="border-t border-white/50 bg-white/55 px-6 py-5 backdrop-blur-xl">
          <Button
            type="submit"
            form="create-listing-form"
            disabled={isSubmitting}
            className="h-14 w-full rounded-[1.4rem] bg-[#17381C] text-lg font-black text-white shadow-xl hover:bg-[#214a28]"
          >
            {isSubmitting ? (
              copy.publishing
            ) : (
              <>
                <Check className="mr-2 size-5" />
                {copy.publish}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
