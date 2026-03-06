#!/usr/bin/env node

import { runCli } from "./cli.js";
import { createDefaultRuntime } from "./runtime.js";

const exitCode = await runCli(process.argv.slice(2), createDefaultRuntime());
process.exit(exitCode);
