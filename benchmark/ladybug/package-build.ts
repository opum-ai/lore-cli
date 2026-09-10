import { resolve } from "node:path";

const WINDOWS_REFERENCE_ONLY_NAMESPACE = "lore-windows-reference-only-ladybug";

const WINDOWS_REFERENCE_ONLY_LADYBUG = `
export class Connection {
  constructor() {
    throw new Error("Ladybug native indexing is unavailable in Lore Windows builds");
  }
}

export class Database {
  constructor() {
    throw new Error("Ladybug native indexing is unavailable in Lore Windows builds");
  }
}

const ladybug = Object.freeze({ VERSION: "0.19.0", STORAGE_VERSION: "43" });
export default ladybug;
`;

export const windowsReferenceOnlyLadybugPlugin: Bun.BunPlugin = {
  name: "windows-reference-only-ladybug",
  setup(build) {
    build.onResolve({ filter: /^@ladybugdb\/core$/ }, () => ({
      path: "@ladybugdb/core",
      namespace: WINDOWS_REFERENCE_ONLY_NAMESPACE,
    }));
    build.onLoad({ filter: /.*/, namespace: WINDOWS_REFERENCE_ONLY_NAMESPACE }, () => ({
      contents: WINDOWS_REFERENCE_ONLY_LADYBUG,
      loader: "js",
    }));
  },
};

export function packageBuildConfig(entrypoint: string, target: string, outfile: string): Bun.BuildConfig {
  if (!target.startsWith("bun-")) throw new Error(`invalid Bun compile target: ${target}`);
  return {
    entrypoints: [resolve(entrypoint)],
    compile: {
      target: target as Bun.Build.CompileTarget,
      outfile: resolve(outfile),
    },
    plugins: target.startsWith("bun-windows-") ? [windowsReferenceOnlyLadybugPlugin] : [],
  };
}

function requiredArgument(prefix: string): string {
  const value = Bun.argv
    .slice(2)
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
  if (!value) throw new Error(`missing ${prefix.slice(0, -1)}`);
  return value;
}

async function main(): Promise<void> {
  const target = requiredArgument("--target=");
  const outfile = requiredArgument("--outfile=");
  const entrypoint = requiredArgument("--entrypoint=");
  const result = await Bun.build(packageBuildConfig(entrypoint, target, outfile));
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error(`failed to compile package binary for ${target}`);
  }
}

if (import.meta.main) await main();
