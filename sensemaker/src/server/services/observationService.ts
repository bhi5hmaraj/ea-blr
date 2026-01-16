import type { Prisma, Revision, $Enums } from '@prisma/client';
import type { Deps } from '../deps';
import {
  CreateObservationInput,
  Observation as ObservationSchema,
  RevisionPayload,
  validateExtractedData,
} from '@/lib/schema';
import { notFound, notImplemented } from '../http/errors';
import { cleanUndefined } from '../utils';
import { createObservation, findObservationById, listObservations, updateObservation } from '../repositories/observationRepo';
import { createRevision } from '../repositories/revisionRepo';
import { upsertListing } from '../repositories/listingRepo';
import { computeContentHash, deriveSourceRef } from '../content';
import { prepareObservationContent } from '../content/prep';
import { getStorage } from '../storage';

function coerceRawMeta(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function createObservationService(
  deps: Deps,
  input: CreateObservationInput,
  actorId: string | null
) {
  const storage = getStorage();

  let sourceRef: string | null = null;
  let rawFormat: $Enums.RawFormat = 'TEXT';
  let rawText: string | null = null;
  let rawBlobRef: string | null = null;
  let rawMeta: Prisma.InputJsonValue | undefined = undefined;

  if (input.kind === 'text') {
    const stored = await storage.putText({
      content: input.text,
      pathnamePrefix: 'observations',
      contentType: 'text/markdown',
    });

    rawFormat = 'MARKDOWN';
    rawBlobRef = stored.url;
    rawMeta = {
      kind: 'text',
      contentType: stored.contentType,
      sizeBytes: stored.size,
      pathname: stored.pathname,
    };
  }

  if (input.kind === 'url') {
    sourceRef = input.url;
    rawFormat = 'HTML';
    rawMeta = { kind: 'url' };
  }

  if (input.kind === 'file') {
    rawBlobRef = input.fileUrl;
    const isPdf = input.contentType === 'application/pdf';
    rawFormat = isPdf ? 'PDF' : 'IMAGE';
    rawMeta = {
      kind: 'file',
      contentType: input.contentType,
      filename: input.filename ?? null,
      sizeBytes: input.sizeBytes ?? null,
    };
  }

  const derivedSourceRef = deriveSourceRef({
    sourceRef,
    rawBlobRef,
    rawText,
  });

  const contentHash = computeContentHash({
    rawText,
    rawBlobRef,
    sourceRef: derivedSourceRef,
  });

  const observation = await createObservation(deps.prisma, {
    sourceType: input.sourceType,
    sourceRef: derivedSourceRef,
    rawFormat,
    rawText,
    rawBlobRef,
    rawMeta,
    contentHash,
    createdBy: actorId,
  });

  return observation;
}

export async function getObservationService(deps: Deps, id: string) {
  const observation = await findObservationById(deps.prisma, id);
  if (!observation) {
    throw notFound('Observation not found');
  }
  return observation;
}

export async function listObservationsService(
  deps: Deps,
  params: {
    filters: {
      status?: $Enums.ProcessingStatus;
      sourceType?: $Enums.ObservationSource;
      createdBy?: string;
    };
    sortField: string;
    sortOrder: 'asc' | 'desc';
    skip: number;
    take: number;
  }
) {
  const where: Prisma.ObservationWhereInput = {};

  if (params.filters.status) {
    where.processingStatus = params.filters.status;
  }

  if (params.filters.sourceType) {
    where.sourceType = params.filters.sourceType;
  }

  if (params.filters.createdBy) {
    where.createdBy = params.filters.createdBy;
  }

  return listObservations(deps.prisma, {
    where,
    orderBy: { [params.sortField]: params.sortOrder },
    skip: params.skip,
    take: params.take,
  });
}

export async function processObservationService(
  deps: Deps,
  observationId: string,
  actorId: string | null
) {
  const observation = await findObservationById(deps.prisma, observationId);
  if (!observation) {
    throw notFound('Observation not found');
  }

  const baseForKernel = ObservationSchema.parse({
    ...observation,
    sourceRef: observation.sourceRef ?? null,
    rawText: observation.rawText ?? null,
    rawBlobRef: observation.rawBlobRef ?? null,
    rawMeta: coerceRawMeta(observation.rawMeta),
    lastError: observation.lastError ?? null,
    processedAt: observation.processedAt ?? null,
    createdBy: observation.createdBy ?? null,
    processedBy: observation.processedBy ?? null,
  });

  const kernel = deps.kernels.resolve(baseForKernel);
  if (!kernel) {
    throw notImplemented('No kernel configured for processing');
  }

  try {
    const prepared = await prepareObservationContent(observation);
    const observationForKernel = ObservationSchema.parse({
      ...baseForKernel,
      rawText: prepared.markdown ?? baseForKernel.rawText,
      rawBlobRef: prepared.rawBlobRef ?? baseForKernel.rawBlobRef,
      rawMeta: coerceRawMeta(prepared.rawMeta) ?? baseForKernel.rawMeta,
      rawFormat: (prepared.rawFormat as typeof baseForKernel.rawFormat) ?? baseForKernel.rawFormat,
    });
    const payloads = await kernel.process(observationForKernel);
    const parsedPayloads = RevisionPayload.array().parse(payloads);
    if (parsedPayloads.length === 0) {
      throw new Error('Kernel returned no revisions');
    }

    const now = deps.now();

    const result = await deps.prisma.$transaction(async (tx) => {
      const revisions: Revision[] = [];

      for (const payload of parsedPayloads) {
        const validation = validateExtractedData(payload.kind as 'JOB' | 'NEWS', payload.data, payload.schemaVersion);
        if (!validation.success) {
          throw new Error(`Invalid payload for ${payload.kind} v${payload.schemaVersion}`);
        }

        const listing = await upsertListing(tx, {
          canonicalKey: payload.canonicalKey,
          create: {
            kind: payload.kind,
            canonicalKey: payload.canonicalKey,
            title: payload.title ?? null,
            orgName: payload.orgName ?? null,
            sourceUrl: payload.sourceUrl ?? null,
          },
          update: cleanUndefined({
            title: payload.title ?? undefined,
            orgName: payload.orgName ?? undefined,
            sourceUrl: payload.sourceUrl ?? undefined,
          }),
        });

        const revision = await createRevision(tx, {
          listing: { connect: { id: listing.id } },
          observation: { connect: { id: observation.id } },
          schemaVersion: payload.schemaVersion,
          status: 'PENDING',
          extracted: payload.data as Prisma.InputJsonValue,
        });

        revisions.push(revision);
      }

      const updatedObservation = await updateObservation(tx, observation.id, {
        rawBlobRef: prepared.rawBlobRef ?? observation.rawBlobRef,
        rawMeta: prepared.rawMeta
          ? (JSON.parse(JSON.stringify(prepared.rawMeta)) as Prisma.InputJsonValue)
          : undefined,
        rawFormat: (prepared.rawFormat as typeof observation.rawFormat) ?? observation.rawFormat,
        rawText: prepared.markdown ? null : observation.rawText,
        processingStatus: 'DONE',
        processedAt: now,
        processedBy: actorId,
        processingAttempts: { increment: 1 },
        lastError: null,
      });

      return { observation: updatedObservation, revisions };
    });

    return result;
  } catch (error) {
    await updateObservation(deps.prisma, observation.id, {
      processingStatus: 'FAILED',
      processedAt: deps.now(),
      processedBy: actorId,
      processingAttempts: { increment: 1 },
      lastError: error instanceof Error ? error.message : 'Processing failed',
    });

    throw error;
  }
}
