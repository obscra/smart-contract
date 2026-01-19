.PHONY: all build test lint fmt clean deploy-devnet seed airdrop keys size

# ─── config ──────────────────────────────────────────────────────────────────
CLUSTER      ?= localnet
SOL_CLUSTER  := $(if $(filter mainnet,$(CLUSTER)),mainnet-beta,$(CLUSTER))
WALLET       ?= ~/.config/solana/id.json
PROGRAM_NAME := data_market

# ─── default ─────────────────────────────────────────────────────────────────
all: build

# ─── build ───────────────────────────────────────────────────────────────────
build:
	anchor build
	@echo "[obscra] build complete"

build-verifiable:
	anchor build --verifiable

# ─── test ────────────────────────────────────────────────────────────────────
test:
	anchor test

test-skip-validator:
	anchor test --skip-local-validator

test-verbose:
	anchor test 2>&1 | tee /tmp/obscra_test.log

# ─── code quality ────────────────────────────────────────────────────────────
lint:
	cargo clippy --all-targets -- -D warnings
	yarn tsc --noEmit

fmt:
	cargo fmt --all
	yarn prettier --write 'app/**/*.ts' 'tests/**/*.ts' 'scripts/**/*.ts'

fmt-check:
	cargo fmt --all -- --check

audit:
	cargo audit

# ─── deploy ──────────────────────────────────────────────────────────────────
keys:
	anchor keys list

deploy-devnet:
	anchor build
	anchor deploy --provider.cluster devnet --provider.wallet $(WALLET)
	$(MAKE) init-devnet

init-devnet:
	ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
	ANCHOR_WALLET=$(WALLET) \
	ts-node scripts/deploy.ts --cluster devnet

deploy-mainnet:
	@echo "[obscra] mainnet deploy — ctrl+c to abort"
	@sleep 5
	anchor build --verifiable
	anchor deploy --provider.cluster mainnet-beta --provider.wallet $(WALLET)
	ANCHOR_PROVIDER_URL=https://api.mainnet-beta.solana.com \
	ANCHOR_WALLET=$(WALLET) \
	ts-node scripts/deploy.ts --cluster mainnet-beta

# ─── helpers ─────────────────────────────────────────────────────────────────
airdrop:
	ts-node scripts/airdrop.ts $(PK) $(SOL) $(CLUSTER)

seed:
	ANCHOR_PROVIDER_URL=$(URL) ANCHOR_WALLET=$(WALLET) ts-node scripts/seed.ts

# ─── program size ────────────────────────────────────────────────────────────
size: build
	@SZ=$$(wc -c < target/deploy/$(PROGRAM_NAME).so); \
	echo "[obscra] program size: $$(numfmt --to=iec $$SZ) / 1.5 MiB limit"

# ─── IDL management ──────────────────────────────────────────────────────────
idl-upload:
	anchor idl init \
		--filepath target/idl/$(PROGRAM_NAME).json \
		--provider.cluster $(SOL_CLUSTER) \
		$$(anchor keys list | awk '{print $$NF}')

idl-upgrade:
	anchor idl upgrade \
		--filepath target/idl/$(PROGRAM_NAME).json \
		--provider.cluster $(SOL_CLUSTER) \
		$$(anchor keys list | awk '{print $$NF}')

# ─── clean ───────────────────────────────────────────────────────────────────
clean:
	cargo clean
	rm -rf dist node_modules/.cache .anchor target/types
	@echo "[obscra] cleaned"
