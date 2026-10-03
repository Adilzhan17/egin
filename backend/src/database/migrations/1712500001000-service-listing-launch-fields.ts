import { MigrationInterface, QueryRunner } from 'typeorm';

export class ServiceListingLaunchFields1712500001000
  implements MigrationInterface
{
  name = 'ServiceListingLaunchFields1712500001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "service_listings"
      ADD COLUMN IF NOT EXISTS "availability" character varying NOT NULL DEFAULT 'on_request'
    `);
    await queryRunner.query(`
      ALTER TABLE "service_listings"
      ADD COLUMN IF NOT EXISTS "serviceArea" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "service_listings"
      ADD COLUMN IF NOT EXISTS "responseSlaHours" integer NOT NULL DEFAULT 24
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "service_listings"
      DROP COLUMN IF EXISTS "responseSlaHours"
    `);
    await queryRunner.query(`
      ALTER TABLE "service_listings"
      DROP COLUMN IF EXISTS "serviceArea"
    `);
    await queryRunner.query(`
      ALTER TABLE "service_listings"
      DROP COLUMN IF EXISTS "availability"
    `);
  }
}
