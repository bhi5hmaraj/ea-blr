/**
 * Shared types for Sensemaker
 *
 * All types derive from Zod schemas (single source of truth)
 */

// Re-export everything from the Zod schema (source of truth)
export * from '../lib/schema';

// Prisma client for database operations (implementation detail)
export { prisma } from '../lib/prisma';
