import { Injectable } from '@nestjs/common';
import {
  InfoCenterCategory,
  InfoCenterStatus,
} from './entities/info-center-item.entity';

type SourceConfig = {
  id: string;
  category: InfoCenterCategory;
  status: InfoCenterStatus;
  isFeatured: boolean;
  url: string;
  fallbackTitle: string;
  fallbackSummary: string;
  fallbackContent: string;
  publishedAt: string;
  sourceLabel: string;
};

type FeedItem = {
  id: string;
  category: InfoCenterCategory;
  categoryLabel: string;
  title: string;
  summary: string;
  content: string;
  status: InfoCenterStatus;
  region: string | null;
  sourceLabel: string | null;
  actionLabel: string;
  actionUrl: string | null;
  imageUrl: string | null;
  publishedAt: string;
  isFeatured: boolean;
};

const OFFICIAL_SOURCES: SourceConfig[] = [
  {
    id: 'news-structure-crops',
    category: InfoCenterCategory.NEWS,
    status: InfoCenterStatus.NEW,
    isFeatured: true,
    url: 'https://www.gov.kz/memleket/entities/moa/press/news/details/1167858?lang=ru',
    fallbackTitle: 'Площади под масличные и кормовые культуры увеличили в Казахстане',
    fallbackSummary:
      'На 2026 год структура посевов смещается в сторону кормовых, масличных, бобовых и кукурузы, при сокращении доли пшеницы.',
    fallbackContent:
      'Официальный материал МСХ РК о структуре посевных площадей и приоритетах по культурам на сезон 2026 года.',
    publishedAt: '2026-04-05',
    sourceLabel: 'gov.kz / МСХ РК',
  },
  {
    id: 'news-sowing-finance',
    category: InfoCenterCategory.NEWS,
    status: InfoCenterStatus.UPDATE,
    isFeatured: true,
    url: 'https://www.gov.kz/memleket/entities/moa/press/news/details/1131706?lang=ru',
    fallbackTitle: 'Свыше 1,3 тыс. заявок поступило на финансирование посевной 2026',
    fallbackSummary:
      'Государство заранее запустило финансирование посевной кампании, а аграрии уже подали более 1,3 тыс. заявок.',
    fallbackContent:
      'Официальная сводка МСХ РК по заявкам и раннему финансированию посевной кампании 2026 года.',
    publishedAt: '2026-04-06',
    sourceLabel: 'gov.kz / МСХ РК',
  },
  {
    id: 'subsidies-grain-logistics',
    category: InfoCenterCategory.SUBSIDIES,
    status: InfoCenterStatus.IMPORTANT,
    isFeatured: true,
    url: 'https://www.gov.kz/memleket/entities/moa/press/news/details/1076414?lang=ru',
    fallbackTitle:
      'Меры господдержки производителей и экспортеров зерна продлены до 2026 года',
    fallbackSummary:
      'Продлены правила субсидирования затрат на перевозку зерна и поддержки логистики в агропромышленном комплексе.',
    fallbackContent:
      'Официальный материал о продлении правил субсидирования логистических расходов по зерну до 1 сентября 2026 года.',
    publishedAt: '2026-04-04',
    sourceLabel: 'gov.kz / МСХ РК',
  },
  {
    id: 'export-processed-agro',
    category: InfoCenterCategory.EXPORT,
    status: InfoCenterStatus.UPDATE,
    isFeatured: true,
    url: 'https://www.gov.kz/memleket/entities/moa/press/news/details/1163130?lang=ru',
    fallbackTitle: 'Казахстан увеличил экспорт переработанной сельхозпродукции',
    fallbackSummary:
      'Экспорт переработанной агропродукции вырос, а доля продукции с добавленной стоимостью продолжает увеличиваться.',
    fallbackContent:
      'Официальная публикация МСХ РК о росте экспорта переработанной продукции и новых экспортных ориентирах.',
    publishedAt: '2026-04-04',
    sourceLabel: 'gov.kz / МСХ РК',
  },
  {
    id: 'import-substitution-machinery',
    category: InfoCenterCategory.IMPORT,
    status: InfoCenterStatus.UPDATE,
    isFeatured: false,
    url: 'https://www.gov.kz/memleket/entities/moa/press/news/details/880363?lang=ru',
    fallbackTitle: 'Казахстан наращивает производство сельхозтехники и импортозамещение',
    fallbackSummary:
      'Официальный фокус сделан на импортозамещении, лизинге техники и росте локального производства для агросектора.',
    fallbackContent:
      'Официальный материал о технике, финансировании и курсе на снижение зависимости от импорта в агросекторе.',
    publishedAt: '2026-04-03',
    sourceLabel: 'gov.kz / МСХ РК',
  },
  {
    id: 'prices-social-food',
    category: InfoCenterCategory.PRICES,
    status: InfoCenterStatus.NEW,
    isFeatured: false,
    url: 'https://www.gov.kz/memleket/entities/mti/press/news/details/601748?lang=en',
    fallbackTitle:
      'Рост цен на социально значимые продукты за неделю остался на нуле',
    fallbackSummary:
      'Министерство торговли сообщает о нулевом недельном росте цен на социально значимые продовольственные товары.',
    fallbackContent:
      'Официальная сводка МТИ РК по социально значимым продуктам и текущей ценовой динамике.',
    publishedAt: '2026-04-02',
    sourceLabel: 'gov.kz / МТИ РК',
  },
];

@Injectable()
export class InfoCenterService {
  private cache:
    | {
        expiresAt: number;
        items: FeedItem[];
      }
    | null = null;

  private readonly cacheTtlMs = 30 * 60 * 1000;

  private buildCategoryLabel(category: InfoCenterCategory) {
    switch (category) {
      case InfoCenterCategory.NEWS:
        return 'Новости';
      case InfoCenterCategory.SUBSIDIES:
        return 'Субсидии';
      case InfoCenterCategory.EXPORT:
        return 'Экспорт';
      case InfoCenterCategory.IMPORT:
        return 'Импорт';
      case InfoCenterCategory.PRICES:
        return 'Цены';
      default:
        return 'Инфоцентр';
    }
  }

  private extractMeta(html: string, names: string[]) {
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const patterns = [
        new RegExp(
          `<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
          'i',
        ),
        new RegExp(
          `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`,
          'i',
        ),
        new RegExp(
          `<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
          'i',
        ),
        new RegExp(
          `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`,
          'i',
        ),
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) {
          return this.decodeHtml(match[1].trim());
        }
      }
    }

    return null;
  }

  private decodeHtml(value: string) {
    return value
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  private normalizeImageUrl(imageUrl: string | null, sourceUrl: string) {
    if (!imageUrl) {
      return null;
    }

    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      return imageUrl;
    }

    try {
      return new URL(imageUrl, sourceUrl).toString();
    } catch {
      return null;
    }
  }

  private extractFirstImage(html: string) {
    const match = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    return match?.[1] ? this.decodeHtml(match[1].trim()) : null;
  }

  private async fetchSource(config: SourceConfig): Promise<FeedItem> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(config.url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; AgriPlanBot/1.0; +https://agriplan.local)',
        },
      });

      const html = response.ok ? await response.text() : '';
      const title =
        this.extractMeta(html, ['og:title', 'twitter:title']) ??
        config.fallbackTitle;
      const description =
        this.extractMeta(html, ['og:description', 'description']) ??
        config.fallbackSummary;
      const imageUrl = this.normalizeImageUrl(
        this.extractMeta(html, ['og:image', 'twitter:image']) ??
          this.extractFirstImage(html),
        config.url,
      );
      const publishedAt =
        this.extractMeta(html, ['article:published_time'])?.slice(0, 10) ??
        config.publishedAt;

      return {
        id: config.id,
        category: config.category,
        categoryLabel: this.buildCategoryLabel(config.category),
        title,
        summary: description,
        content: config.fallbackContent,
        status: config.status,
        region: null,
        sourceLabel: config.sourceLabel,
        actionLabel: 'Открыть источник',
        actionUrl: config.url,
        imageUrl,
        publishedAt,
        isFeatured: config.isFeatured,
      };
    } catch {
      return {
        id: config.id,
        category: config.category,
        categoryLabel: this.buildCategoryLabel(config.category),
        title: config.fallbackTitle,
        summary: config.fallbackSummary,
        content: config.fallbackContent,
        status: config.status,
        region: null,
        sourceLabel: config.sourceLabel,
        actionLabel: 'Открыть источник',
        actionUrl: config.url,
        imageUrl: null,
        publishedAt: config.publishedAt,
        isFeatured: config.isFeatured,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getOfficialFeed() {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.items;
    }

    const items = await Promise.all(
      OFFICIAL_SOURCES.map((source) => this.fetchSource(source)),
    );

    items.sort((left, right) =>
      right.publishedAt.localeCompare(left.publishedAt),
    );

    this.cache = {
      expiresAt: now + this.cacheTtlMs,
      items,
    };

    return items;
  }

  async getCategories() {
    return Object.values(InfoCenterCategory).map((category) => ({
      key: category,
      label: this.buildCategoryLabel(category),
    }));
  }

  async getFeed(options?: {
    category?: string;
    region?: string | null;
    featuredOnly?: boolean;
    limit?: number;
  }) {
    const items = await this.getOfficialFeed();

    const filtered = items.filter((item) => {
      if (options?.category && item.category !== options.category) {
        return false;
      }

      if (options?.featuredOnly && !item.isFeatured) {
        return false;
      }

      return true;
    });

    return typeof options?.limit === 'number'
      ? filtered.slice(0, options.limit)
      : filtered;
  }

  async getHomeCards(region?: string | null) {
    return this.getFeed({
      region,
      featuredOnly: true,
      limit: 5,
    });
  }
}
