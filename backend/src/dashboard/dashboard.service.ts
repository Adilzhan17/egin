import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FarmPlot } from '../farm-plots/entities/farm-plot.entity';
import { InfoCenterService } from '../info-center/info-center.service';
import {
  ListingStatus,
  MarketplaceListing,
} from '../marketplace/entities/marketplace-listing.entity';
import { User } from '../users/entities/user.entity';
import { WeatherService } from '../weather/weather.service';

type CompetitionLevel = 'low' | 'medium' | 'high';

type CropProfile = {
  color: string;
  growthDaysMin: number;
  growthDaysMax: number;
  shelfLifeDays: number;
  storage: string;
  watering: string;
  soil: string;
  disease: string;
  temperature: string;
  lifehack: string;
  commonMistake: string;
};

const DEFAULT_CROP_PROFILE: CropProfile = {
  color: '#D9B44A',
  growthDaysMin: 90,
  growthDaysMax: 120,
  shelfLifeDays: 30,
  storage: 'Сухое хранение без резких перепадов температуры.',
  watering: 'Следите за равномерной влажностью без перелива.',
  soil: 'Лучше растет на рыхлой и подготовленной почве.',
  disease: 'Проводите регулярный осмотр на болезни и вредителей.',
  temperature: 'Избегайте резких температурных стрессов.',
  lifehack: 'Делайте осмотры по календарю роста, а не только по факту проблем.',
  commonMistake: 'Поздняя реакция на стресс культуры и неравномерный полив.',
};

const CROP_PROFILES: Record<string, CropProfile> = {
  Картофель: {
    color: '#8B6A3E',
    growthDaysMin: 80,
    growthDaysMax: 120,
    shelfLifeDays: 120,
    storage: 'Хранить в сухом, темном и хорошо проветриваемом месте.',
    watering: 'Не переливать в прохладную погоду, держать почву умеренно влажной.',
    soil: 'Нужна рыхлая почва и окучивание на активной стадии роста.',
    disease: 'Следить за фитофторой и состоянием ботвы.',
    temperature: 'При резкой жаре контролировать пересыхание почвы.',
    lifehack: 'Окучивание и ранний контроль сорняков заметно повышают итоговый урожай.',
    commonMistake: 'Избыточный полив при прохладе и поздняя реакция на фитофтору.',
  },
  Лук: {
    color: '#8E44AD',
    growthDaysMin: 90,
    growthDaysMax: 150,
    shelfLifeDays: 180,
    storage: 'После просушки хранить в сухом помещении с низкой влажностью.',
    watering: 'Снижать полив ближе к созреванию.',
    soil: 'Любит легкую и не переувлажненную почву.',
    disease: 'Проверять на грибковые заболевания и гниль шейки.',
    temperature: 'Избегать длительного застоя влаги в прохладные периоды.',
    lifehack: 'Сокращение полива перед уборкой улучшает лежкость.',
    commonMistake: 'Затяжной полив перед сбором и плохая просушка.',
  },
  Пшеница: {
    color: '#D4AF37',
    growthDaysMin: 90,
    growthDaysMax: 130,
    shelfLifeDays: 240,
    storage: 'Хранить сухим зерном с контролем влажности.',
    watering: 'Ключевой контроль влаги нужен в критические стадии развития.',
    soil: 'Важны подготовка поля и питание на старте.',
    disease: 'Следить за ржавчиной и грибковыми болезнями.',
    temperature: 'Жара в период налива зерна снижает качество.',
    lifehack: 'Контроль питания и сроков обработки сильнее влияет на доход, чем поздние меры.',
    commonMistake: 'Поздние обработки и недооценка стресса в фазе налива.',
  },
  Помидоры: {
    color: '#C0392B',
    growthDaysMin: 75,
    growthDaysMax: 110,
    shelfLifeDays: 14,
    storage: 'Хранить недолго, быстро направлять в продажу или логистику.',
    watering: 'Полив равномерный, без резких скачков влажности.',
    soil: 'Нужна питательная почва и контроль вентиляции.',
    disease: 'Следить за фитофторой и растрескиванием плодов.',
    temperature: 'Сильная жара резко повышает стресс и риск потери качества.',
    lifehack: 'Стабильная влажность помогает удерживать качество плода.',
    commonMistake: 'Редкий, но слишком обильный полив.',
  },
  Кукуруза: {
    color: '#E67E22',
    growthDaysMin: 90,
    growthDaysMax: 140,
    shelfLifeDays: 120,
    storage: 'После сушки хранить с контролем влажности.',
    watering: 'Особенно важна в фазе активного роста и налива.',
    soil: 'Нужна почва с хорошим питанием и стартовой подготовкой.',
    disease: 'Следить за стеблевыми и листовыми поражениями.',
    temperature: 'Жара и ветер повышают риск потери влаги.',
    lifehack: 'Контроль влаги в пиковые фазы сильнее влияет на урожай, чем поздние подкормки.',
    commonMistake: 'Недостаток влаги в период активного роста.',
  },
  Арбуз: {
    color: '#2E8B57',
    growthDaysMin: 80,
    growthDaysMax: 110,
    shelfLifeDays: 21,
    storage: 'Хранить недолго, избегать ударов и перегрева при перевозке.',
    watering: 'Поддерживать влагу равномерно, но не переувлажнять.',
    soil: 'Лучше работает на теплой, легкой почве.',
    disease: 'Следить за гнилями и состоянием плетей.',
    temperature: 'Резкие похолодания тормозят развитие.',
    lifehack: 'Контроль нагрузки плодов помогает улучшить товарный размер.',
    commonMistake: 'Переувлажнение в сочетании с прохладной погодой.',
  },
};

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(FarmPlot)
    private readonly plotRepository: Repository<FarmPlot>,
    @InjectRepository(MarketplaceListing)
    private readonly listingRepository: Repository<MarketplaceListing>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly weatherService: WeatherService,
    private readonly infoCenterService: InfoCenterService,
  ) {}

  private getCropProfile(cropName: string | null) {
    if (!cropName) {
      return DEFAULT_CROP_PROFILE;
    }

    return CROP_PROFILES[cropName] ?? DEFAULT_CROP_PROFILE;
  }

  private getSeasonStatus(month: number) {
    if (month >= 3 && month <= 5) {
      return {
        code: 'planting',
        title: 'Посев и подготовка',
        summary: 'Период активной подготовки полей, посадки и первых агроработ.',
      };
    }

    if (month >= 6 && month <= 8) {
      return {
        code: 'active_growth',
        title: 'Активный рост',
        summary: 'Критичный этап контроля влаги, болезней и плотности посевов.',
      };
    }

    if (month >= 9 && month <= 11) {
      return {
        code: 'harvest',
        title: 'Сбор и продажа',
        summary: 'Фокус на сроках уборки, качестве, хранении и каналах сбыта.',
      };
    }

    return {
      code: 'planning',
      title: 'Планирование сезона',
      summary: 'Подготовка к следующему циклу: анализ, закупки, выбор культур.',
    };
  }

  private calculateCompetition(areaSizeHectares: number) {
    const safeArea = Number(areaSizeHectares || 0);

    if (safeArea >= 200) {
      return { score: 0.85, level: 'high' as CompetitionLevel };
    }

    if (safeArea >= 80) {
      return { score: 0.55, level: 'medium' as CompetitionLevel };
    }

    return { score: 0.2, level: 'low' as CompetitionLevel };
  }

  private buildInsight(level: CompetitionLevel, cropName: string | null) {
    if (!cropName) {
      return {
        title: 'Добавьте культуру',
        message:
          'Назначьте культуру хотя бы одному участку, чтобы получить анализ конкуренции и прогноз дохода.',
        confidence: 0.25,
      };
    }

    if (level === 'high') {
      return {
        title: 'Высокая конкуренция',
        message: `По культуре "${cropName}" уже высокая плотность. Лучше проверить альтернативную культуру или другое окно продаж.`,
        confidence: 0.78,
      };
    }

    if (level === 'medium') {
      return {
        title: 'Средняя конкуренция',
        message: `По культуре "${cropName}" ситуация умеренная. Стоит следить за соседними посевами и ценой в маркетплейсе.`,
        confidence: 0.66,
      };
    }

    return {
      title: 'Низкая конкуренция',
      message: `По культуре "${cropName}" конкуренция низкая. Это хороший кандидат для фокусной посадки, но listing можно скрывать по вашей стратегии niche-first.`,
      confidence: 0.72,
    };
  }

  private formatWeatherSummary(today: {
    temperature: number | null;
    precipitationProbability: number | null;
    summary: string;
  } | null) {
    if (!today) {
      return 'Погодные данные временно недоступны.';
    }

    const temp =
      today.temperature !== null ? `${Math.round(today.temperature)}°C` : 'n/a';
    const precipitation =
      today.precipitationProbability !== null
        ? `${Math.round(today.precipitationProbability)}%`
        : 'n/a';

    return `Сегодня: ${temp}, осадки: ${precipitation}, ${today.summary.toLowerCase()}.`;
  }

  private resolveWeatherTarget(plots: FarmPlot[], user: User | null) {
    const plotsByArea = [...plots].sort(
      (left, right) =>
        Number(right.areaSizeHectares || 0) - Number(left.areaSizeHectares || 0),
    );

    for (const plot of plotsByArea) {
      const coords = this.weatherService.getPlotCoordinates(plot.geometry);

      if (coords) {
        return {
          source: 'plot' as const,
          coords,
          plotId: plot.id,
          plotTitle: plot.title ?? null,
        };
      }
    }

    const regionCoords = this.weatherService.getRegionCoordinates(user?.region);
    if (regionCoords) {
      return {
        source: 'region' as const,
        coords: regionCoords,
        plotId: null,
        plotTitle: null,
      };
    }

    return {
      source: 'unavailable' as const,
      coords: null,
      plotId: null,
      plotTitle: null,
    };
  }

  async getHomeDashboard(userId: string) {
    const [user, plots, activeListings] = await Promise.all([
      this.userRepository.findOne({
        where: { id: userId },
      }),
      this.plotRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
      }),
      this.listingRepository.count({
        where: {
          farmerId: userId,
          status: ListingStatus.ACTIVE,
        },
      }),
    ]);

    const totalArea = plots.reduce(
      (sum, plot) => sum + Number(plot.areaSizeHectares || 0),
      0,
    );

    const cropBuckets = new Map<
      string,
      { area: number; plotCount: number; fillColor: string | null }
    >();

    for (const plot of plots) {
      if (!plot.cropType) {
        continue;
      }

      const current = cropBuckets.get(plot.cropType) ?? {
        area: 0,
        plotCount: 0,
        fillColor: plot.fillColor ?? null,
      };

      current.area += Number(plot.areaSizeHectares || 0);
      current.plotCount += 1;
      current.fillColor = current.fillColor ?? plot.fillColor ?? null;
      cropBuckets.set(plot.cropType, current);
    }

    const cropSummaries = Array.from(cropBuckets.entries())
      .map(([cropType, data]) => {
        const competition = this.calculateCompetition(data.area);
        const cropProfile = this.getCropProfile(cropType);
        const cropPlots = plots.filter((plot) => plot.cropType === cropType);
        const latestPlantingDate = cropPlots
          .map((plot) => plot.plantingDate)
          .filter(Boolean)
          .sort((left, right) => {
            return new Date(right as Date).getTime() - new Date(left as Date).getTime();
          })[0];

        const plantedAt = latestPlantingDate ? new Date(latestPlantingDate) : null;
        const now = new Date();
        const daysPassed = plantedAt
          ? Math.max(
              0,
              Math.floor(
                (now.getTime() - plantedAt.getTime()) / (1000 * 60 * 60 * 24),
              ),
            )
          : 0;
        const averageGrowthDays = Math.round(
          (cropProfile.growthDaysMin + cropProfile.growthDaysMax) / 2,
        );
        const daysRemaining = plantedAt
          ? Math.max(0, averageGrowthDays - daysPassed)
          : averageGrowthDays;
        const harvestDateEstimate = plantedAt
          ? new Date(
              plantedAt.getTime() + averageGrowthDays * 24 * 60 * 60 * 1000,
            )
          : null;

        return {
          cropType,
          areaHectares: Number(data.area.toFixed(2)),
          plotsCount: data.plotCount,
          fillColor: data.fillColor,
          competitionLevel: competition.level,
          competitionScore: competition.score,
          growthDaysMin: cropProfile.growthDaysMin,
          growthDaysMax: cropProfile.growthDaysMax,
          shelfLifeDays: cropProfile.shelfLifeDays,
          storage: cropProfile.storage,
          tips: {
            watering: cropProfile.watering,
            soil: cropProfile.soil,
            disease: cropProfile.disease,
            temperature: cropProfile.temperature,
            lifehack: cropProfile.lifehack,
            commonMistake: cropProfile.commonMistake,
          },
          plantingDate: plantedAt ? plantedAt.toISOString().slice(0, 10) : null,
          daysPassed,
          daysRemaining,
          harvestDateEstimate: harvestDateEstimate
            ? harvestDateEstimate.toISOString().slice(0, 10)
            : null,
        };
      })
      .sort((left, right) => right.areaHectares - left.areaHectares);

    const dominantCrop = cropSummaries[0] ?? null;
    const averageCompetitionScore =
      cropSummaries.length > 0
        ? cropSummaries.reduce((sum, crop) => sum + crop.competitionScore, 0) /
          cropSummaries.length
        : 0;

    const averageCompetitionLevel = this.calculateCompetition(
      averageCompetitionScore * 200,
    ).level;

    const projectedIncome =
      cropSummaries.reduce(
        (sum, crop) =>
          sum + crop.areaHectares * (crop.competitionLevel === 'low' ? 420000 : 310000),
        0,
      ) || 0;

    const insight = this.buildInsight(
      dominantCrop?.competitionLevel ?? 'low',
      dominantCrop?.cropType ?? null,
    );
    const currentMonth = new Date().getMonth() + 1;
    const season = this.getSeasonStatus(currentMonth);
    const weatherTarget = this.resolveWeatherTarget(plots, user);
    let weatherBlock: {
      status: string;
      source: 'plot' | 'region' | 'unavailable';
      plotId: string | null;
      plotTitle: string | null;
      location: {
        lat: number | null;
        lng: number | null;
        region: string | null;
        district: string | null;
      };
      summary: string;
      today: {
        temperature: number | null;
        precipitationProbability: number | null;
        windSpeed: number | null;
        summary: string;
      } | null;
      forecast: Array<{
        day: string;
        summary: string;
        tempMin: number | null;
        tempMax: number | null;
        precipitationProbability: number | null;
        windSpeed: number | null;
      }>;
      alerts?: Array<{
        type: string;
        severity: 'info' | 'warning' | 'critical';
        day: string;
        message: string;
      }>;
    } = {
      status: 'missing_coordinates',
      source: weatherTarget.source,
      plotId: weatherTarget.plotId,
      plotTitle: weatherTarget.plotTitle,
      location: {
        lat: weatherTarget.coords?.lat ?? null,
        lng: weatherTarget.coords?.lng ?? null,
        region: user?.region ?? null,
        district: user?.district ?? null,
      },
      summary:
        'Добавьте геометрию поля или регион, чтобы получать персонализированный прогноз и агро-предупреждения.',
      today: null,
      forecast: [],
    };

    if (weatherTarget.coords) {
      try {
        const forecastResult = await this.weatherService.getForecast(
          weatherTarget.coords.lat,
          weatherTarget.coords.lng,
          7,
        );
        const forecastItems = forecastResult.forecast ?? [];
        const firstDay = forecastItems[0] ?? null;

        weatherBlock = {
          status: 'live',
          source: weatherTarget.source,
          plotId: weatherTarget.plotId,
          plotTitle: weatherTarget.plotTitle,
          location: {
            lat: weatherTarget.coords.lat,
            lng: weatherTarget.coords.lng,
            region: user?.region ?? null,
            district: user?.district ?? null,
          },
          summary: this.formatWeatherSummary(
            firstDay
              ? {
                  temperature: firstDay.tempMax,
                  precipitationProbability: firstDay.precipitationProbability,
                  summary: firstDay.summary,
                }
              : null,
          ),
          today: firstDay
            ? {
                temperature: firstDay.tempMax,
                precipitationProbability: firstDay.precipitationProbability,
                windSpeed: firstDay.windSpeed,
                summary: firstDay.summary,
              }
            : null,
          forecast: forecastItems.slice(0, 3).map((item) => ({
            day: item.day,
            summary: item.summary,
            tempMin: item.tempMin,
            tempMax: item.tempMax,
            precipitationProbability: item.precipitationProbability,
            windSpeed: item.windSpeed,
          })),
          alerts: forecastResult.alerts ?? [],
        };
      } catch {
        weatherBlock = {
          status: 'provider_error',
          source: weatherTarget.source,
          plotId: weatherTarget.plotId,
          plotTitle: weatherTarget.plotTitle,
          location: {
            lat: weatherTarget.coords.lat,
            lng: weatherTarget.coords.lng,
            region: user?.region ?? null,
            district: user?.district ?? null,
          },
          summary:
            'Не удалось получить погоду от внешнего провайдера. Проверьте доступ к сети и настройки weather API.',
          today: null,
          forecast: [],
        };
      }
    }

    const cropAnalysis = dominantCrop
      ? {
          cropType: dominantCrop.cropType,
          areaHectares: dominantCrop.areaHectares,
          growthStage:
            dominantCrop.daysPassed === 0
              ? 'Планирование'
              : dominantCrop.daysRemaining <= 14
                ? 'Почти готово к сбору'
                : dominantCrop.daysPassed <= 30
                  ? 'Ранний рост'
                  : 'Активный рост',
          daysUntilHarvest: dominantCrop.daysRemaining,
          harvestDateEstimate: dominantCrop.harvestDateEstimate,
          competitionLevel: dominantCrop.competitionLevel,
          demandLevel:
            dominantCrop.competitionLevel === 'high'
              ? 'средний'
              : 'высокий',
          projectedIncomeKzt: Math.round(
            dominantCrop.areaHectares *
              (dominantCrop.competitionLevel === 'low'
                ? 420000
                : dominantCrop.competitionLevel === 'medium'
                  ? 310000
                  : 240000),
          ),
          recommendation:
            dominantCrop.competitionLevel === 'high'
              ? 'Рынок плотный: лучше публиковать частями и следить за ценой.'
              : dominantCrop.competitionLevel === 'medium'
                ? 'Можно готовить продажу, но стоит отслеживать соседние посевы и спрос.'
                : 'Низкая конкуренция: сделайте ставку на локальный спрос и качественную упаковку.',
        }
      : null;

    const forecasts = dominantCrop
      ? {
          yield: {
            trend:
              dominantCrop.competitionLevel === 'high' ? 'stable' : 'upside',
            summary:
              dominantCrop.daysRemaining > 20
                ? 'Есть запас времени улучшить урожайность через контроль влаги и болезней.'
                : 'Основной фокус уже на качестве сбора и потере после уборки.',
          },
          price: {
            trend:
              dominantCrop.competitionLevel === 'high' ? 'pressure' : 'healthy',
            summary:
              dominantCrop.competitionLevel === 'high'
                ? 'Цена может быть под давлением из-за насыщенности по культуре.'
                : 'Цена выглядит устойчивее при локальной продаже и хорошей свежести.',
          },
          demand: {
            trend:
              dominantCrop.competitionLevel === 'low' ? 'high' : 'medium',
            summary:
              dominantCrop.competitionLevel === 'low'
                ? 'Спрос можно усиливать через локальную выдачу и быструю логистику.'
                : 'Спрос есть, но придется конкурировать по срокам и качеству.',
          },
          competition: {
            trend: dominantCrop.competitionLevel,
            summary: insight.message,
          },
          harvest: {
            daysRemaining: dominantCrop.daysRemaining,
            harvestDateEstimate: dominantCrop.harvestDateEstimate,
            summary: dominantCrop.harvestDateEstimate
              ? `Ориентир по сбору: ${dominantCrop.harvestDateEstimate}.`
              : 'Добавьте дату посадки, чтобы получить более точный ориентир сбора.',
          },
        }
      : null;

    const infoCenter = await this.infoCenterService.getHomeCards(user?.region ?? null);

    return {
      profile: {
        fullName: user?.fullName ?? 'Фермер',
        region: user?.region ?? null,
        district: user?.district ?? null,
      },
      season,
      stats: {
        totalPlots: plots.length,
        cropsCount: cropSummaries.length,
        totalAreaHectares: Number(totalArea.toFixed(2)),
        averageCompetitionLevel,
        averageCompetitionScore: Number(averageCompetitionScore.toFixed(2)),
        projectedIncomeKzt: Math.round(projectedIncome),
        activeListings,
      },
      crops: cropSummaries,
      plots: plots.map((plot) => ({ id: plot.id, title: plot.title, cropType: plot.cropType })),
      weather: weatherBlock,
      insight,
      cropAnalysis,
      forecasts,
      infoCenter,
    };
  }

  async getNotifications(userId: string) {
    const [plots, activeListings] = await Promise.all([
      this.plotRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
      }),
      this.listingRepository.count({
        where: {
          farmerId: userId,
          status: ListingStatus.ACTIVE,
        },
      }),
    ]);

    const notifications: Array<{
      id: string;
      type: 'info' | 'warning' | 'success';
      title: string;
      message: string;
    }> = [];

    const unassignedPlots = plots.filter((plot) => !plot.cropType).length;
    if (unassignedPlots > 0) {
      notifications.push({
        id: 'assign-crop',
        type: 'warning',
        title: 'Назначьте культуру',
        message: `У вас ${unassignedPlots} участков без культуры. Без этого AI не сможет посчитать конкуренцию.`,
      });
    }

    const highCompetitionPlots = plots.filter(
      (plot) => this.calculateCompetition(Number(plot.areaSizeHectares || 0)).level === 'high',
    ).length;
    if (highCompetitionPlots > 0) {
      notifications.push({
        id: 'competition-high',
        type: 'warning',
        title: 'Есть участки с высокой конкуренцией',
        message: `Найдено ${highCompetitionPlots} участков, где конкуренция по площади уже высокая.`,
      });
    }

    if (plots.length > 0 && activeListings === 0) {
      notifications.push({
        id: 'marketplace-empty',
        type: 'info',
        title: 'Маркетплейс пока пустой',
        message:
          'У вас есть поля, но нет активных объявлений. После добавления visibility rule часть культур можно публиковать автоматически.',
      });
    }

    if (notifications.length === 0) {
      notifications.push({
        id: 'all-good',
        type: 'success',
        title: 'Система в порядке',
        message:
          'Ключевые данные заполнены. Следующий шаг: подключить погоду, чат и AI-рекомендации.',
      });
    }

    return notifications;
  }

  async getInsights(userId: string) {
    const dashboard = await this.getHomeDashboard(userId);

    return {
      summary: dashboard.insight,
      drivers: [
        {
          label: 'competition',
          impact: dashboard.stats.averageCompetitionScore,
        },
        {
          label: 'crop_mix',
          impact: dashboard.stats.cropsCount > 1 ? 0.62 : 0.39,
        },
        {
          label: 'market_readiness',
          impact: dashboard.stats.activeListings > 0 ? 0.74 : 0.31,
        },
      ],
      explainability: {
        model: 'rule-based-mvp',
        notes:
          'Insight построен на реальных данных полей и объявлений, без синтетической погоды и без внешнего ML.',
      },
    };
  }
}
