import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getKernelRegistry } from './kernels';

export interface Deps {
  prisma: PrismaClient;
  kernels: ReturnType<typeof getKernelRegistry>;
  now: () => Date;
}

let cachedDeps: Deps | null = null;

export function getDeps(): Deps {
  if (!cachedDeps) {
    cachedDeps = {
      prisma,
      kernels: getKernelRegistry(),
      now: () => new Date(),
    };
  }

  return cachedDeps;
}
