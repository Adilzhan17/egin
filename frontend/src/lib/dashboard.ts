export type DashboardCrop = {
  cropType: string;
  areaHectares: number;
  plotsCount: number;
  fillColor: string | null;
  competitionLevel: "low" | "medium" | "high";
  competitionScore: number;
  growthDaysMin: number;
  growthDaysMax: number;
  shelfLifeDays: number;
  storage: string;
  plantingDate: string | null;
  daysPassed: number;
  daysRemaining: number;
  harvestDateEstimate: string | null;
  tips: {
    watering: string;
    soil: string;
    disease: string;
    temperature: string;
    lifehack: string;
    commonMistake: string;
  };
};

export type DashboardResponse = {
  profile: {
    fullName: string;
    region: string | null;
    district: string | null;
  };
  season: {
    code: string;
    title: string;
    summary: string;
  };
  stats: {
    totalPlots: number;
    cropsCount: number;
    totalAreaHectares: number;
    averageCompetitionLevel: "low" | "medium" | "high";
    averageCompetitionScore: number;
    projectedIncomeKzt: number;
    activeListings: number;
  };
  crops: DashboardCrop[];
  plots?: Array<{ id: string; title: string; cropType?: string | null }>;
  weather: {
    status: string;
    source: "plot" | "region" | "unavailable";
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
      severity: "info" | "warning" | "critical";
      day: string;
      message: string;
    }>;
  };
  insight: {
    title: string;
    message: string;
    confidence: number;
  };
  cropAnalysis: {
    cropType: string;
    areaHectares: number;
    growthStage: string;
    daysUntilHarvest: number;
    harvestDateEstimate: string | null;
    competitionLevel: "low" | "medium" | "high";
    demandLevel: string;
    projectedIncomeKzt: number;
    recommendation: string;
  } | null;
  forecasts: {
    yield: { trend: string; summary: string };
    price: { trend: string; summary: string };
    demand: { trend: string; summary: string };
    competition: { trend: string; summary: string };
    harvest: {
      daysRemaining: number;
      harvestDateEstimate: string | null;
      summary: string;
    };
  } | null;
  infoCenter: Array<{
    id: string;
    category: string;
    categoryLabel: string;
    title: string;
    summary: string;
    status: string;
    imageUrl?: string | null;
    actionLabel?: string | null;
    actionUrl?: string | null;
    publishedAt?: string;
  }>;
};

export type SavedPlotResult = {
  plot: {
    id: string;
    title: string;
    cropType: string;
    areaSizeHectares: number;
    fillColor?: string | null;
  };
  competition: {
    score: number;
    level: "low" | "medium" | "high";
    confidence: number;
    marketplaceVisibility: "hidden" | "visible";
    explanation: string;
    nearbyAreaHectares: number;
    nearbyPlotCount: number;
  };
  projectedIncomeKzt: number;
};

export type FarmActivityType =
  | "watering"
  | "fertilizer"
  | "pesticide"
  | "planting"
  | "harvest"
  | "inspection"
  | "expense";

export type FarmActivity = {
  id: string;
  type: FarmActivityType;
  activityDate: string | Date;
  description: string;
  costKzt: number;
  materials: string[];
  photoUrl?: string | null;
};

export type PlotSeasonSummary = {
  plotId: string;
  title: string;
  cropType?: string | null;
  seasonYear: number;
  areaSizeHectares: number;
  activityCount: number;
  totalExpensesKzt: number;
  projectedIncomeKzt: number;
  projectedProfitKzt: number;
  costPerHectareKzt: number;
  competitionLevel: "low" | "medium" | "high";
  latestActivity: FarmActivity | null;
  note: string;
};

export type PlotAiAdvice = {
  title: string;
  summary: string;
  actions: string[];
  risks: string[];
  confidenceNote: string;
  source: string;
};
