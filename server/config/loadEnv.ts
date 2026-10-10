import { existsSync } from 'node:fs';
import { EnvError, parseEnv, type Env } from './env.js';

/**
 * Loads .env (if present) and validates the environment.
 * Exits the process with a readable message when configuration is wrong: fail fast, never half-start.
 */
export function loadEnvOrExit(): Env {
  if (existsSync('.env')) process.loadEnvFile('.env');
  try {
    return parseEnv(process.env);
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(`\n${error.message}\n\nCopy .env.example to .env and fill in the missing values.\n`);
      process.exit(1);
    }
    throw error;
  }
}
