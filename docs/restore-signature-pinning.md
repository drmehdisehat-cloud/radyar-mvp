# Pinned signer fingerprints for restore evidence

The dual-signature verifier checks that two distinct Ed25519 keys signed the same canonical manifest. A valid signature alone does not establish that a key belongs to the named operator or reviewer.

For restore-evidence review, use `scripts/verify-restore-attestation-pinned.cjs` after the owner and independent reviewer have obtained each public-key SHA-256 fingerprint through a separate trusted channel.

## Required sequence

1. The restore operator generates and retains the operator private key on a trusted machine. The reviewer independently generates and retains a different reviewer private key.
2. Exchange only public keys through a controlled channel. Do not place private keys, backup archives, raw hosting logs, client records, or credentials in Git or the public document root.
3. Each person calculates the SHA-256 fingerprint of their own Ed25519 SubjectPublicKeyInfo DER public key. The owner/reviewer must compare these fingerprints using a channel independent of the manifest, signatures, and files being checked.
4. After the real isolated restore and independent inspection, both parties sign the exact same canonical manifest bytes.
5. Run the pinned verifier with the two fingerprints confirmed out of band:

```sh
node scripts/verify-restore-attestation-pinned.cjs \
  --manifest /secure/local/restore-manifest.json \
  --operator-public-key /secure/local/operator-public.pem \
  --operator-signature /secure/local/operator.sig \
  --reviewer-public-key /secure/local/reviewer-public.pem \
  --reviewer-signature /secure/local/reviewer.sig \
  --expected-operator-public-key-sha256 "$EXPECTED_OPERATOR_SHA256" \
  --expected-reviewer-public-key-sha256 "$EXPECTED_REVIEWER_SHA256"
```

The two environment variables above are placeholders for fingerprints independently verified by the owner/reviewer; do not copy values from an untrusted evidence bundle without out-of-band comparison.

## Interpretation

A successful result means:
- Both Ed25519 signatures verify over the same canonical manifest.
- The supplied operator public-key fingerprint matches the independently supplied operator pin.
- The supplied reviewer public-key fingerprint matches the independently supplied reviewer pin.
- The two signing keys are distinct.

A successful result still does **not**:
- Authenticate the real-world identity of either person.
- Prove that the hosting provider actually completed a restore.
- Prove that the restored database is usable or production was untouched.
- Validate the destination file or public URL.
- Authorize deployment.

The output therefore deliberately retains:
- `signer_identity_independently_verified: false`
- `restore_operation_independently_verified: false`
- `deployment_authorized: false`

All input files must be absolute-path regular files outside the Git checkout, with no symlink in their path. The command reads evidence only; it does not connect to cPanel, perform a restore, contact the website, or deploy anything.

The test fixture uses only synthetic keys, manifest values, and temporary files. It is not restore evidence.
