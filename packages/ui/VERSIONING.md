# `@growx/ui` API governance

The package follows semantic versioning. Stable exports are safe for product adoption; additive changes are minor releases and breaking changes are major releases. Experimental exports are explicitly marked in documentation and may change between minor releases. Deprecated exports remain for one minor release with a migration note before removal.

Every public component documents its purpose, states, keyboard behavior, accessibility contract, and composition examples. Product applications must use `@growx/ui` for shared controls, overlays, tables, and developer surfaces. Exceptions require a reason, owner, explanation of why the package cannot support the use case, and a follow-up plan.
