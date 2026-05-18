import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

type VerifyWithDsa = (
  algorithm: string | null | undefined,
  data: crypto.BinaryLike,
  key: crypto.KeyLike,
  signature: crypto.BinaryLike,
  options?: { dsaEncoding?: 'ieee-p1363' | 'der' },
) => boolean;

const verifyDigest = crypto.verify as VerifyWithDsa;

/**
 * Apple Root CA - G3 (ECC). Public trust anchor for StoreKit JWS (`x5c`).
 *
 * Source: Apple PKI — https://www.apple.com/certificateauthority/
 */
const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

/**
 * Apple Root CA - G2 (RSA). Alternate public anchor for older / parallel issuance chains.
 *
 * Source: Apple PKI — https://www.apple.com/certificateauthority/
 */
const APPLE_ROOT_CA_G2_PEM = `-----BEGIN CERTIFICATE-----
MIIFkjCCA3qgAwIBAgIIAeDltYNno+AwDQYJKoZIhvcNAQEMBQAwZzEbMBkGA1UE
AwwSQXBwbGUgUm9vdCBDQSAtIEcyMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0
aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMw
HhcNMTQwNDMwMTgxMDA5WhcNMzkwNDMwMTgxMDA5WjBnMRswGQYDVQQDDBJBcHBs
ZSBSb290IENBIC0gRzIxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0
aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzCCAiIwDQYJ
KoZIhvcNAQEBBQADggIPADCCAgoCggIBANgREkhI2imKScUcx+xuM23+TfvgHN6s
XuI2pyT5f1BrTM65MFQn5bPW7SXmMLYFN14UIhHF6Kob0vuy0gmVOKTvKkmMXT5x
ZgM4+xb1hYjkWpIMBDLyyED7Ul+f9sDx47pFoFDVEovy3d6RhiPw9bZyLgHaC/Yu
OQhfGaFjQQscp5TBhsRTL3b2CtcM0YM/GlMZ81fVJ3/8E7j4ko380yhDPLVoACVd
J2LT3VXdRCCQgzWTxb+4Gftr49wIQuavbfqeQMpOhYV4SbHXw8EwOTKrfl+q04tv
ny0aIWhwZ7Oj8ZhBbZF8+NfbqOdfIRqMM78xdLe40fTgIvS/cjTf94FNcX1RoeKz
8NMoFnNvzcytN31O661A4T+B/fc9Cj6i8b0xlilZ3MIZgIxbdMYs0xBTJh0UT8TU
gWY8h2czJxQI6bR3hDRSj4n4aJgXv8O7qhOTH11UL6jHfPsNFL4VPSQ08prcdUFm
IrQB1guvkJ4M6mL4m1k8COKWNORj3rw31OsMiANDC1CvoDTdUE0V+1ok2Az6DGOe
HwOx4e7hqkP0ZmUoNwIx7wHHHtHMn23KVDpA287PT0aLSmWaasZobNfMmRtHsHLD
d4/E92GcdB/O/WuhwpyUgquUoue9G7q5cDmVF8Up8zlYNPXEpMZ7YLlmQ1A/bmH8
DvmGqmAMQ0uVAgMBAAGjQjBAMB0GA1UdDgQWBBTEmRNsGAPCe8CjoA1/coB6HHcm
jTAPBgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBBjANBgkqhkiG9w0BAQwF
AAOCAgEAUabz4vS4PZO/Lc4Pu1vhVRROTtHlznldgX/+tvCHM/jvlOV+3Gp5pxy+
8JS3ptEwnMgNCnWefZKVfhidfsJxaXwU6s+DDuQUQp50DhDNqxq6EWGBeNjxtUVA
eKuowM77fWM3aPbn+6/Gw0vsHzYmE1SGlHKy6gLti23kDKaQwFd1z4xCfVzmMX3z
ybKSaUYOiPjjLUKyOKimGY3xn83uamW8GrAlvacp/fQ+onVJv57byfenHmOZ4VxG
/5IFjPoeIPmGlFYl5bRXOJ3riGQUIUkhOb9iZqmxospvPyFgxYnURTbImHy99v6Z
SYA7LNKmp4gDBDEZt7Y6YUX6yfIjyGNzv1aJMbDZfGKnexWoiIqrOEDCzBL/FePw
N983csvMmOa/orz6JopxVtfnJBtIRD6e/J/JzBrsQzwBvDR4yGn1xuZW7AYJNpDr
FEobXsmII9oDMJELuDY++ee1KG++P+w8j2Ud5cAeh6Squpj9kuNsJnfdBrRkBof0
Tta6SqoWqPQFZ2aWuuJVecMsXUmPgEkrihLHdoBR37q9ZV0+N0djMenl9MU/S60E
inpxLK8JQzcPqOMyT/RFtm2XNuyE9QoB6he7hY1Ck3DDUOUUi78/w0EP3SIEIwiK
um1xRKtzCTrJ+VKACd+66eYWyi4uTLLT3OUEVLLUNIAytbwPF+E=
-----END CERTIFICATE-----`;

/** Ordered anchors Apple documents for verifying StoreKit / notification JWS. */
const APPLE_ROOT_CA_ANCHOR_PEMS = [APPLE_ROOT_CA_G3_PEM, APPLE_ROOT_CA_G2_PEM];

function verifyChainAnchoredToAppleRoot(lastIssuerCert: crypto.X509Certificate): void {
  for (const pem of APPLE_ROOT_CA_ANCHOR_PEMS) {
    try {
      const rootAnchor = new crypto.X509Certificate(pem);
      if (lastIssuerCert.verify(rootAnchor.publicKey)) {
        return;
      }
    } catch {
      // Embedded PEMs are static; ignore parse errors defensively.
    }
  }
  throw new UnauthorizedException('Apple JWS root of trust verification failed');
}

function base64UrlDecode(input: string): Buffer {
  const padLen = (4 - (input.length % 4)) % 4;
  const pad = '='.repeat(padLen);
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

function verifyEs256JwsSignature(leaf: crypto.X509Certificate, signingInput: string, sig: Buffer): boolean {
  const key = leaf.publicKey;
  const data = Buffer.from(signingInput, 'utf8');
  if (verifyDigest('sha256', data, key, sig, { dsaEncoding: 'ieee-p1363' })) {
    return true;
  }
  return verifyDigest('sha256', data, key, sig);
}

/**
 * Verifies StoreKit / App Store Server Notifications compact JWS:
 * ES256 signature over `protectedHeader.payload` using leaf cert from x5c,
 * and anchors the chain to **Apple Root CA - G3 or Apple Root CA - G2**.
 *
 * Optionally enforces `bundleId` when present on the decoded payload (outer notification
 * uses `data.bundleId`; inner transaction payloads use top-level `bundleId`).
 */
export function verifyAppleStoreKitJws(
  compactJws: string,
  expectedBundleId?: string | null,
): Record<string, unknown> {
  const parts = compactJws.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedException('Invalid Apple JWS format');
  }

  const [headerB64, payloadB64, sigB64] = parts;

  let headerJson: Record<string, unknown>;
  try {
    headerJson = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new UnauthorizedException('Invalid Apple JWS header');
  }

  if (headerJson.alg !== 'ES256') {
    throw new UnauthorizedException('Unsupported Apple JWS algorithm');
  }

  const x5cRaw = headerJson.x5c;
  if (!Array.isArray(x5cRaw) || x5cRaw.length === 0 || x5cRaw.some((c) => typeof c !== 'string')) {
    throw new UnauthorizedException('Missing Apple JWS x5c chain');
  }

  let certs: crypto.X509Certificate[];
  try {
    certs = x5cRaw.map((derB64) => new crypto.X509Certificate(Buffer.from(derB64, 'base64')));
  } catch {
    throw new UnauthorizedException('Invalid Apple JWS certificates');
  }

  for (let i = 0; i < certs.length - 1; i++) {
    try {
      if (!certs[i].verify(certs[i + 1].publicKey)) {
        throw new UnauthorizedException('Apple JWS certificate chain verification failed');
      }
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Apple JWS certificate chain verification failed');
    }
  }

  const last = certs[certs.length - 1];
  try {
    verifyChainAnchoredToAppleRoot(last);
  } catch (e) {
    if (e instanceof UnauthorizedException) throw e;
    throw new UnauthorizedException('Apple JWS root of trust verification failed');
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  let sig: Buffer;
  try {
    sig = base64UrlDecode(sigB64);
  } catch {
    throw new UnauthorizedException('Invalid Apple JWS signature encoding');
  }

  const leaf = certs[0];
  let ok = false;
  try {
    ok = verifyEs256JwsSignature(leaf, signingInput, sig);
  } catch {
    throw new UnauthorizedException('Apple JWS signature verification failed');
  }

  if (!ok) {
    throw new UnauthorizedException('Apple JWS signature invalid');
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new UnauthorizedException('Invalid Apple JWS payload');
  }

  if (expectedBundleId?.trim()) {
    const expected = expectedBundleId.trim();
    const data = payload.data as Record<string, unknown> | undefined;
    const bundleFromInner =
      (typeof payload.bundleId === 'string' && payload.bundleId.trim()) ||
      (data && typeof data.bundleId === 'string' && data.bundleId.trim());

    if (bundleFromInner && bundleFromInner !== expected) {
      throw new UnauthorizedException('Apple JWS bundleId mismatch');
    }
  }

  return payload;
}

/**
 * After the outer notification JWS is verified, verifies nested JWS blobs and reads
 * `originalTransactionId` from signed transaction or renewal info.
 */
export function extractAppleOriginalTransactionIdFromNotificationPayload(
  verifiedOuterPayload: Record<string, unknown>,
  expectedBundleId?: string | null,
): string | null {
  const data = (verifiedOuterPayload.data ?? {}) as Record<string, unknown>;
  const signedTx = typeof data.signedTransactionInfo === 'string' ? data.signedTransactionInfo : null;
  const signedRenewal =
    typeof data.signedRenewalInfo === 'string' ? data.signedRenewalInfo : null;

  if (signedTx) {
    const tx = verifyAppleStoreKitJws(signedTx, expectedBundleId);
    const id = typeof tx.originalTransactionId === 'string' ? tx.originalTransactionId.trim() : null;
    if (id) return id;
  }
  if (signedRenewal) {
    const ren = verifyAppleStoreKitJws(signedRenewal, expectedBundleId);
    const id =
      typeof ren.originalTransactionId === 'string' ? ren.originalTransactionId.trim() : null;
    if (id) return id;
  }
  return null;
}
