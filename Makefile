.PHONY: version version-set version-bump version-check help

PYTHON ?= python3

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  make %-18s %s\n", $$1, $$2}'

version: ## Print current version
	@$(PYTHON) scripts/sync_version.py

version-set: ## Set version everywhere (usage: make version-set V=0.8.0)
	@test -n "$(V)" || (echo "Error: V is required. Usage: make version-set V=0.8.0" && exit 1)
	@$(PYTHON) scripts/sync_version.py --set $(V)

version-bump: ## Bump version everywhere (usage: make version-bump B=minor)
	@test -n "$(B)" || (echo "Error: B is required. Usage: make version-bump B=patch" && exit 1)
	@$(PYTHON) scripts/sync_version.py --bump $(B)

version-check: ## Verify all version files are in sync (CI)
	@$(PYTHON) scripts/sync_version.py --check
