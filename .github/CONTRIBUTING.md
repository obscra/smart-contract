# Contributing to OBSCRA

Thanks for your interest in contributing. Here's what you need to get started.

---

## Development setup

```bash
# 1. Fork + clone
git clone https://github.com/obscra/obscra-contracts && cd obscra-contracts

# 2. Rust toolchain (1.78+)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup default 1.78.0
rustup component add clippy rustfmt

# 3. Solana CLI (1.18.9)
sh -c "$(curl -sSfL https://release.solana.com/v1.18.9/install)"
solana-keygen new --no-bip39-passphrase --silent

# 4. Anchor CLI (0.30.1)
cargo install --git https://github.com/coral-xyz/anchor \
  anchor-cli --tag v0.30.1 --locked

# 5. Node dependencies
yarn install
```

---

## Running tests

```bash
# Local validator (starts automatically)
make test

# Against an already-running validator
make test-skip-validator
```

---

## Code style

| Tool | When | Command |
|---|---|---|
| `rustfmt` | Before every commit | `make fmt` |
| `clippy -D warnings` | Before every PR | `make lint` |
| `prettier` | TypeScript files | `make fmt` |

Recommended pre-commit hook:

```bash
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
make fmt-check lint
EOF
chmod +x .git/hooks/pre-commit
```

---

## Commit messages

```
<type>(<scope>): <short summary>

Types: feat, fix, docs, refactor, test, chore, perf, security
Scope: admin, listing, english, dutch, sealed, subscription, review, dispute, sdk, ci

Examples:
  feat(sealed): add partial-reveal batch ix
  fix(english): refund exact bid amount instead of escrow balance
  security(escrow): add rent-exempt floor check before pda_withdraw
```

---

## Pull request checklist

- [ ] `make test` passes locally
- [ ] `make lint` passes (no clippy warnings)
- [ ] New instructions have matching Anchor test coverage
- [ ] Emits an `#[event]` for every state transition
- [ ] New accounts have a `SIZE` const and are added to `state/mod.rs`
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] Docs updated if you changed a public-facing instruction signature

---

## Reporting vulnerabilities

**Do not open a public GitHub issue for security bugs.**
Email `security@obscra.xyz` with `[OBSCRA CVE]` in the subject line.
Include reproduction steps, affected versions, and expected vs. actual behaviour.
We target 72-hour acknowledgement and 14-day patch cycle.
