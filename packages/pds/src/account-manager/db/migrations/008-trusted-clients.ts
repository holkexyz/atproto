import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('trusted_client')
    .addColumn('clientId', 'varchar', (col) => col.primaryKey())
    .addColumn('brandName', 'varchar', (col) => col.notNull())
    .addColumn('logoUrl', 'varchar')
    .addColumn('brandColor', 'varchar')
    .addColumn('supportEmail', 'varchar')
    .addColumn('createdAt', 'varchar', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute()

  await db
    .insertInto('trusted_client' as never)
    .values([
      {
        clientId:
          'https://certified-app-seven.vercel.app/.well-known/oauth-client-metadata',
        brandName: 'Certified',
        logoUrl:
          'https://certified-app-seven.vercel.app/assets/certified_brandmark.svg',
        brandColor: '#0F2544',
        supportEmail: 'support@certified.earth',
      },
      {
        clientId:
          'https://maearth.io/.well-known/oauth-client-metadata',
        brandName: 'Ma Earth',
        logoUrl: 'https://maearth.io/logo.png',
        brandColor: '#2D6A4F',
        supportEmail: 'support@maearth.io',
      },
      {
        clientId:
          'https://gainforest.org/.well-known/oauth-client-metadata',
        brandName: 'GainForest',
        logoUrl: 'https://gainforest.org/logo.png',
        brandColor: '#0B6E4F',
        supportEmail: 'support@gainforest.org',
      },
    ] as never)
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('trusted_client').execute()
}
