#!/usr/bin/env bun
/** Compiled-distribution entrypoint; unlike an imported CLI module, this always runs Lore. */

import { main } from "./cli";

await main();
