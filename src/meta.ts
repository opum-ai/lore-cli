import pkg from "../package.json" with { type: "json" };

/** The package name as presented by the CLI. */
export const NAME = "lore";

/** The CLI version, sourced from package.json so there is a single source of truth. */
export const VERSION: string = pkg.version;
