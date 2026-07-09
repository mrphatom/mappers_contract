# Mappers Protocol — Developer Commands
# Usage: make <target>

.PHONY: install build test oracle-install oracle-dev e2e clean

# ─── SETUP ───────────────────────────────────────────────────────────────────

install:
        pnpm install

oracle-install:
        cd oracle && npm install

setup: install oracle-install
        @echo "✅ All dependencies installed"

# ─── CONTRACT ────────────────────────────────────────────────────────────────

build:
        anchor build

# ─── TESTS ───────────────────────────────────────────────────────────────────

test: build
        anchor test --provider.cluster localnet

test-devnet: build
        anchor test --provider.cluster devnet

# ─── ORACLE ──────────────────────────────────────────────────────────────────

oracle-dev:
        cd oracle && npm run dev

oracle-build:
        cd oracle && npm run build

# ─── END-TO-END ──────────────────────────────────────────────────────────────

# Run oracle first in a separate terminal: make oracle-dev
e2e:
        ts-node scripts/e2e-devnet.ts

# ─── CLEAN ───────────────────────────────────────────────────────────────────

clean:
        rm -rf target
        rm -rf node_modules
        rm -rf oracle/node_modules
        rm -rf oracle/dist
        rm -rf .anchor
