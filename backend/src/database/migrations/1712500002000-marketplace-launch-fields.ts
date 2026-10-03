import { MigrationInterface, QueryRunner } from 'typeorm';

export class MarketplaceLaunchFields1712500002000
  implements MigrationInterface
{
  name = 'MarketplaceLaunchFields1712500002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "marketplace_listings"
      ADD COLUMN IF NOT EXISTS "imageUrl" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "marketplace_listings"
      ADD COLUMN IF NOT EXISTS "deliveryAvailable" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "marketplace_listings"
      ADD COLUMN IF NOT EXISTS "deliveryNotes" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "marketplace_listings"
      ADD COLUMN IF NOT EXISTS "freshnessDays" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "marketplace_listings"
      ADD COLUMN IF NOT EXISTS "storageLifeDays" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "marketplace_listings"
      ADD COLUMN IF NOT EXISTS "storageConditions" text
    `);
    await queryRunner.query(`
      ALTER TABLE "marketplace_listings"
      ADD COLUMN IF NOT EXISTS "recommendedRegion" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "marketplace_listings"
      ADD COLUMN IF NOT EXISTS "saleModel" character varying NOT NULL DEFAULT 'lead_chat'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "marketplace_listings"
      DROP COLUMN IF EXISTS "saleModel"
    `);
    await queryRunner.query(`
      ALTER TABLE "marketplace_listings"
      DROP COLUMN IF EXISTS "recommendedRegion"
    `);
    await queryRunner.query(`
      ALTER TABLE "marketplace_listings"
      DROP COLUMN IF EXISTS "storageConditions"
    `);
    await queryRunner.query(`
      ALTER TABLE "marketplace_listings"
      DROP COLUMN IF EXISTS "storageLifeDays"
    `);
    await queryRunner.query(`
      ALTER TABLE "marketplace_listings"
      DROP COLUMN IF EXISTS "freshnessDays"
    `);
    await queryRunner.query(`
      ALTER TABLE "marketplace_listings"
      DROP COLUMN IF EXISTS "deliveryNotes"
    `);
    await queryRunner.query(`
      ALTER TABLE "marketplace_listings"
      DROP COLUMN IF EXISTS "deliveryAvailable"
    `);
    await queryRunner.query(`
      ALTER TABLE "marketplace_listings"
      DROP COLUMN IF EXISTS "imageUrl"
    `);
  }
}
