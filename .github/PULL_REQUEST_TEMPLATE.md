## What does this PR do?

<!-- One paragraph explaining what changed and why. -->

## Change type

- [ ] Bug fix
- [ ] New feature / instruction
- [ ] Security hardening
- [ ] Refactor / cleanup
- [ ] Documentation update
- [ ] CI / tooling / devex

## Modules touched

- [ ] Admin (initialize, config update)
- [ ] User profiles
- [ ] Fixed-price listings
- [ ] English auction
- [ ] Dutch auction
- [ ] Sealed-bid auction
- [ ] Subscriptions
- [ ] Reviews / reputation
- [ ] Disputes / arbitration
- [ ] SDK / TypeScript client
- [ ] Tests
- [ ] CI / scripts / infra

## How was this tested?

```
make test
# Attach output or link to passing CI run
```

## Security notes

<!-- New PDA seeds? Changed fee logic? Additional signer requirements? External account interactions? -->

## Pre-merge checklist

- [ ] `make fmt-check lint` passes locally
- [ ] New or updated tests cover the change
- [ ] `CHANGELOG.md` has an entry under `[Unreleased]`
- [ ] No secrets, keypairs, or `.env` values in the diff
- [ ] Program size still under 1.5 MiB (`make size`)
