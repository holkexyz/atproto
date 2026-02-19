import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('otp_code')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('deviceId', 'varchar', (col) => col.notNull())
    .addColumn('clientId', 'varchar', (col) => col.notNull())
    .addColumn('emailNorm', 'varchar', (col) => col.notNull())
    .addColumn('codeHash', 'varchar', (col) => col.notNull())
    .addColumn('salt', 'varchar', (col) => col.notNull())
    .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('maxAttempts', 'integer', (col) => col.notNull().defaultTo(5))
    .addColumn('expiresAt', 'varchar', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('usedAt', 'varchar')
    .addColumn('requestIp', 'varchar')
    .addColumn('uaHash', 'varchar')
    .execute()

  await db.schema
    .createIndex('idx_otp_device')
    .on('otp_code')
    .column('deviceId')
    .execute()

  await db.schema
    .createIndex('idx_otp_email')
    .on('otp_code')
    .column('emailNorm')
    .execute()

  await db.schema
    .createIndex('idx_otp_expires')
    .on('otp_code')
    .column('expiresAt')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_otp_expires').execute()
  await db.schema.dropIndex('idx_otp_email').execute()
  await db.schema.dropIndex('idx_otp_device').execute()
  await db.schema.dropTable('otp_code').execute()
}
