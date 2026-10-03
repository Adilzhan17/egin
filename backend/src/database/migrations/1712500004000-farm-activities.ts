import { MigrationInterface, QueryRunner } from 'typeorm';

export class FarmActivities1712500004000 implements MigrationInterface {
  name = 'FarmActivities1712500004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'farm_activities_type_enum') THEN
          CREATE TYPE "public"."farm_activities_type_enum" AS ENUM(
            'watering',
            'fertilizer',
            'pesticide',
            'planting',
            'harvest',
            'inspection',
            'expense'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "farm_activities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "plotId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "type" "public"."farm_activities_type_enum" NOT NULL,
        "activityDate" date NOT NULL,
        "description" text,
        "photoUrl" character varying,
        "costKzt" numeric(12,2) NOT NULL DEFAULT '0',
        "materials" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_farm_activities_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_farm_activities_plotId" FOREIGN KEY ("plotId") REFERENCES "farm_plots"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_farm_activities_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_farm_activities_plotId" ON "farm_activities" ("plotId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_farm_activities_userId" ON "farm_activities" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_farm_activities_activityDate" ON "farm_activities" ("activityDate")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_farm_activities_activityDate"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_farm_activities_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_farm_activities_plotId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "farm_activities"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."farm_activities_type_enum"`);
  }
}
