// scripts/generate-jwks.ts
import { generateKeyPair, exportJWK } from "jose"
import { writeFileSync } from "fs"

async function main() {
  const { publicKey, privateKey } = await generateKeyPair("ES256")
  const publicJwk = await exportJWK(publicKey)
  const privateJwk = await exportJWK(privateKey)

  // Add kid
  const kid = crypto.randomUUID()
  publicJwk.kid = kid
  publicJwk.use = "sig"
  publicJwk.alg = "ES256"
  privateJwk.kid = kid
  privateJwk.use = "sig"
  privateJwk.alg = "ES256"

  // Write public JWKS (served at /.well-known/jwks.json)
  writeFileSync(
    "public/.well-known/jwks.json",
    JSON.stringify({ keys: [publicJwk] }, null, 2),
  )

  // Write private key (stored as env var, NOT committed)
  console.log("Private key (store as PDS_OAUTH_PRIVATE_KEY_ES256):")
  console.log(JSON.stringify(privateJwk))
}

main()
