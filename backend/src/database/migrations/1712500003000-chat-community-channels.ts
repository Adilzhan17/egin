import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChatCommunityChannels1712500003000 implements MigrationInterface {
  name = 'ChatCommunityChannels1712500003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chats" ADD COLUMN IF NOT EXISTS "village" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "chats" ADD COLUMN IF NOT EXISTS "cropType" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "chats" ADD COLUMN IF NOT EXISTS "channelKey" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "chats" ADD COLUMN IF NOT EXISTS "channelLabel" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "chats" ADD COLUMN IF NOT EXISTS "isModerated" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'IDX_chats_channelKey') THEN
          CREATE UNIQUE INDEX "IDX_chats_channelKey" ON "chats" ("channelKey") WHERE "channelKey" IS NOT NULL;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_chats_channelKey"`);
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN IF EXISTS "isModerated"`);
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN IF EXISTS "channelLabel"`);
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN IF EXISTS "channelKey"`);
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN IF EXISTS "cropType"`);
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN IF EXISTS "village"`);
  }
}
