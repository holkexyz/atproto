import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db
    .updateTable('trusted_client' as never)
    .set({
      lightColor: '#0F2544',
    } as never)
    .where('clientId' as never, '=' as never,
      'https://certified-app-seven.vercel.app/.well-known/oauth-client-metadata' as never)
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db
    .updateTable('trusted_client' as never)
    .set({
      lightColor: '#F7F8FA',
    } as never)
    .where('clientId' as never, '=' as never,
      'https://certified-app-seven.vercel.app/.well-known/oauth-client-metadata' as never)
    .execute()
}
