import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1712500000000 implements MigrationInterface {
  name = 'InitialSchema1712500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "postgis"`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'users_role_enum') THEN
          CREATE TYPE "public"."users_role_enum" AS ENUM('farmer', 'seller', 'buyer', 'admin');
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'farm_plots_plantingstatus_enum') THEN
          CREATE TYPE "public"."farm_plots_plantingstatus_enum" AS ENUM('planned', 'planted', 'harvested');
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'marketplace_listings_status_enum') THEN
          CREATE TYPE "public"."marketplace_listings_status_enum" AS ENUM('active', 'sold', 'cancelled');
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'marketplace_listings_visibilitystatus_enum') THEN
          CREATE TYPE "public"."marketplace_listings_visibilitystatus_enum" AS ENUM('visible', 'hidden');
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'marketplace_listings_recommendationstatus_enum') THEN
          CREATE TYPE "public"."marketplace_listings_recommendationstatus_enum" AS ENUM('healthy', 'caution', 'low_interest');
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'orders_status_enum') THEN
          CREATE TYPE "public"."orders_status_enum" AS ENUM('pending', 'confirmed', 'completed', 'cancelled');
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chats_type_enum') THEN
          CREATE TYPE "public"."chats_type_enum" AS ENUM('direct', 'regional', 'global', 'transaction');
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'info_center_items_category_enum') THEN
          CREATE TYPE "public"."info_center_items_category_enum" AS ENUM('news', 'subsidies', 'export', 'import', 'prices');
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'info_center_items_status_enum') THEN
          CREATE TYPE "public"."info_center_items_status_enum" AS ENUM('new', 'important', 'update');
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_listings_category_enum') THEN
          CREATE TYPE "public"."service_listings_category_enum" AS ENUM(
            'machinery_rental',
            'plowing',
            'sowing',
            'fertilizer',
            'delivery',
            'storage',
            'agronomist',
            'labor',
            'irrigation',
            'repair'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "fullName" character varying NOT NULL,
        "phone" character varying NOT NULL,
        "email" character varying,
        "passwordHash" character varying NOT NULL,
        "role" "public"."users_role_enum" NOT NULL DEFAULT 'farmer',
        "region" character varying NOT NULL,
        "district" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_phone" UNIQUE ("phone")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "crops" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "category" character varying NOT NULL,
        "color" character varying NOT NULL DEFAULT '#C6A85E',
        "icon" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_crops_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_crops_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "farm_plots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "title" character varying NOT NULL,
        "region" character varying NOT NULL,
        "district" character varying NOT NULL,
        "village" character varying,
        "areaSizeHectares" numeric NOT NULL,
        "geometry" geometry(Polygon,4326),
        "cropType" character varying,
        "fillColor" character varying,
        "seasonYear" integer NOT NULL,
        "plantingDate" date,
        "plantingStatus" "public"."farm_plots_plantingstatus_enum" NOT NULL DEFAULT 'planned',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_farm_plots_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_farm_plots_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_farm_plots_userId" ON "farm_plots" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_farm_plots_geometry" ON "farm_plots" USING GIST ("geometry")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "marketplace_listings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "farmerId" uuid NOT NULL,
        "cropId" character varying NOT NULL,
        "category" character varying NOT NULL DEFAULT 'Все',
        "title" character varying NOT NULL,
        "description" text,
        "quantity" numeric NOT NULL,
        "unit" character varying NOT NULL,
        "price" numeric NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'KZT',
        "availableFrom" date NOT NULL,
        "location" character varying NOT NULL,
        "status" "public"."marketplace_listings_status_enum" NOT NULL DEFAULT 'active',
        "visibilityStatus" "public"."marketplace_listings_visibilitystatus_enum" NOT NULL DEFAULT 'visible',
        "competitionLevel" character varying,
        "competitionScore" numeric,
        "visibilityReason" text,
        "recommendationStatus" "public"."marketplace_listings_recommendationstatus_enum",
        "recommendationTitle" text,
        "recommendationMessage" text,
        "recommendedActions" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_marketplace_listings_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_marketplace_listings_farmerId" FOREIGN KEY ("farmerId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_marketplace_listings_farmerId" ON "marketplace_listings" ("farmerId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "status" "public"."orders_status_enum" NOT NULL DEFAULT 'pending',
        "totalPrice" numeric NOT NULL DEFAULT '0',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_orders_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_orders_userId" ON "orders" ("userId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orderId" uuid NOT NULL,
        "listingId" character varying NOT NULL,
        "title" character varying NOT NULL,
        "quantity" numeric NOT NULL,
        "unit" character varying NOT NULL,
        "priceAtPurchase" numeric NOT NULL,
        CONSTRAINT "PK_order_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_items_orderId" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_order_items_orderId" ON "order_items" ("orderId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chats" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" "public"."chats_type_enum" NOT NULL DEFAULT 'direct',
        "createdBy" uuid NOT NULL,
        "listingId" character varying,
        "region" character varying,
        "district" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chats_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chats_createdBy" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chats_createdBy" ON "chats" ("createdBy")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_participants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "chatId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "lastReadAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_participants_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chat_participants_chatId" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_chat_participants_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chat_participants_chatId" ON "chat_participants" ("chatId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chat_participants_userId" ON "chat_participants" ("userId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "chatId" uuid NOT NULL,
        "senderId" uuid NOT NULL,
        "type" character varying NOT NULL DEFAULT 'text',
        "body" text NOT NULL,
        "attachmentUrl" character varying,
        "metadata" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_messages_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chat_messages_chatId" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_chat_messages_senderId" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chat_messages_chatId" ON "chat_messages" ("chatId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chat_messages_senderId" ON "chat_messages" ("senderId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "info_center_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "category" "public"."info_center_items_category_enum" NOT NULL,
        "title" character varying NOT NULL,
        "summary" character varying(280) NOT NULL,
        "content" text NOT NULL,
        "status" "public"."info_center_items_status_enum" NOT NULL DEFAULT 'new',
        "isFeatured" boolean NOT NULL DEFAULT true,
        "region" character varying,
        "sourceLabel" character varying,
        "actionLabel" character varying,
        "actionUrl" character varying,
        "imageUrl" character varying,
        "publishedAt" date NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_info_center_items_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "service_listings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "category" "public"."service_listings_category_enum" NOT NULL,
        "title" character varying NOT NULL,
        "description" text NOT NULL,
        "priceFrom" numeric(12,2) NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'KZT',
        "urgentAvailable" boolean NOT NULL DEFAULT true,
        "isActive" boolean NOT NULL DEFAULT true,
        "country" character varying NOT NULL,
        "region" character varying NOT NULL,
        "district" character varying NOT NULL,
        "locality" character varying NOT NULL,
        "rating" numeric(3,2) NOT NULL DEFAULT '4.5',
        "reviewsCount" integer NOT NULL DEFAULT '0',
        "completedJobs" integer NOT NULL DEFAULT '0',
        "imageUrl" character varying,
        "providerUserId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_service_listings_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_service_listings_providerUserId" FOREIGN KEY ("providerUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_service_listings_providerUserId" ON "service_listings" ("providerUserId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_service_listings_providerUserId"`);
    await queryRunner.query(`DROP TABLE "service_listings"`);
    await queryRunner.query(`DROP TABLE "info_center_items"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_chat_messages_senderId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_chat_messages_chatId"`);
    await queryRunner.query(`DROP TABLE "chat_messages"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_chat_participants_userId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_chat_participants_chatId"`);
    await queryRunner.query(`DROP TABLE "chat_participants"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_chats_createdBy"`);
    await queryRunner.query(`DROP TABLE "chats"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_order_items_orderId"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_orders_userId"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_marketplace_listings_farmerId"`);
    await queryRunner.query(`DROP TABLE "marketplace_listings"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_farm_plots_geometry"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_farm_plots_userId"`);
    await queryRunner.query(`DROP TABLE "farm_plots"`);
    await queryRunner.query(`DROP TABLE "crops"`);
    await queryRunner.query(`DROP TABLE "users"`);

    await queryRunner.query(`DROP TYPE "public"."service_listings_category_enum"`);
    await queryRunner.query(`DROP TYPE "public"."info_center_items_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."info_center_items_category_enum"`);
    await queryRunner.query(`DROP TYPE "public"."chats_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."marketplace_listings_recommendationstatus_enum"`);
    await queryRunner.query(`DROP TYPE "public"."marketplace_listings_visibilitystatus_enum"`);
    await queryRunner.query(`DROP TYPE "public"."marketplace_listings_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."farm_plots_plantingstatus_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}
