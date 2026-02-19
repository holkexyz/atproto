import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('otp_rate_limit')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('key', 'varchar', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute()

  await db.schema
    .createIndex('idx_otp_rl_key')
    .on('otp_rate_limit')
    .column('key')
    .execute()

  await db.schema
    .createIndex('idx_otp_rl_created')
    .on('otp_rate_limit')
    .column('createdAt')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_otp_rl_created').execute()
  await db.schema.dropIndex('idx_otp_rl_key').execute()
  await db.schema.dropTable('otp_rate_limit').execute()
}
