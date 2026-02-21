import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db
    .insertInto('trusted_client' as never)
    .values({
      clientId:
        'https://maearth-demo-v2.vercel.app/.well-known/oauth-client-metadata',
      brandName: 'Ma Earth',
      logoUrl: 'https://maearth-demo-v2.vercel.app/assets/maearth_logo.png',
      brandColor: '#21201f',
      supportEmail: null,
    } as never)
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db
    .deleteFrom('trusted_client' as never)
    .where(
      'clientId' as never,
      '=' as never,
      'https://maearth-demo-v2.vercel.app/.well-known/oauth-client-metadata' as never,
    )
    .execute()
}
