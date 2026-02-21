import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('trusted_client' as never)
    .addColumn('primaryColor' as never, 'varchar' as never)
    .execute()

  await db.schema
    .alterTable('trusted_client' as never)
    .addColumn('primaryColorContrast' as never, 'varchar' as never)
    .execute()

  await db.schema
    .alterTable('trusted_client' as never)
    .addColumn('lightColor' as never, 'varchar' as never)
    .execute()

  await db.schema
    .alterTable('trusted_client' as never)
    .addColumn('darkColor' as never, 'varchar' as never)
    .execute()

  await db.schema
    .alterTable('trusted_client' as never)
    .addColumn('errorColor' as never, 'varchar' as never)
    .execute()

  await db.schema
    .alterTable('trusted_client' as never)
    .addColumn('warningColor' as never, 'varchar' as never)
    .execute()

  await db.schema
    .alterTable('trusted_client' as never)
    .addColumn('successColor' as never, 'varchar' as never)
    .execute()

  // Backfill Certified client
  await db
    .updateTable('trusted_client' as never)
    .set({
      primaryColor: '#60A1E2',
      primaryColorContrast: '#FFFFFF',
      lightColor: '#F7F8FA',
      darkColor: '#0F2544',
    } as never)
    .where(
      'clientId' as never,
      '=' as never,
      'https://certified-app-seven.vercel.app/.well-known/oauth-client-metadata' as never,
    )
    .execute()

  // Backfill Ma Earth client
  await db
    .updateTable('trusted_client' as never)
    .set({
      primaryColor: '#21201f',
      primaryColorContrast: '#FFFFFF',
      lightColor: '#f2ece4',
      darkColor: '#21201f',
    } as never)
    .where(
      'clientId' as never,
      '=' as never,
      'https://maearth-demo-v2.vercel.app/.well-known/oauth-client-metadata' as never,
    )
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('trusted_client' as never)
    .dropColumn('primaryColor' as never)
    .execute()

  await db.schema
    .alterTable('trusted_client' as never)
    .dropColumn('primaryColorContrast' as never)
    .execute()

  await db.schema
    .alterTable('trusted_client' as never)
    .dropColumn('lightColor' as never)
    .execute()

  await db.schema
    .alterTable('trusted_client' as never)
    .dropColumn('darkColor' as never)
    .execute()

  await db.schema
    .alterTable('trusted_client' as never)
    .dropColumn('errorColor' as never)
    .execute()

  await db.schema
    .alterTable('trusted_client' as never)
    .dropColumn('warningColor' as never)
    .execute()

  await db.schema
    .alterTable('trusted_client' as never)
    .dropColumn('successColor' as never)
    .execute()
}
