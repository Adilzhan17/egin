import { MigrationInterface, QueryRunner } from 'typeorm';

export class ApiUsage1712500005000 implements MigrationInterface {
  name = 'ApiUsage1712500005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "api_usage" (
        "id" SERIAL NOT NULL,
        "provider" character varying NOT NULL,
        "callCount" integer NOT NULL DEFAULT 0,
        "monthlyLimit" integer NOT NULL DEFAULT 28500,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_api_usage_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_api_usage_provider" UNIQUE ("provider")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "api_usage"`);
  }
}
