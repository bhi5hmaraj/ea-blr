import type { Prisma, $Enums } from '@prisma/client';
import type { Deps } from '../deps';
import { ApproveRevisionInput } from '@/lib/schema';
import { notFound } from '../http/errors';
import { mergeJson } from '../utils';
import { findRevisionById, listRevisions, updateRevision } from '../repositories/revisionRepo';
import { updateListing } from '../repositories/listingRepo';

export async function listRevisionsService(
  deps: Deps,
  params: {
    filters: {
      status?: $Enums.RevisionStatus;
      listingId?: string;
      observationId?: string;
    };
    sortField: string;
    sortOrder: 'asc' | 'desc';
    skip: number;
    take: number;
  }
) {
  const where: Prisma.RevisionWhereInput = {};

  if (params.filters.status) {
    where.status = params.filters.status;
  }

  if (params.filters.listingId) {
    where.listingId = params.filters.listingId;
  }

  if (params.filters.observationId) {
    where.observationId = params.filters.observationId;
  }

  return listRevisions(deps.prisma, {
    where,
    orderBy: { [params.sortField]: params.sortOrder },
    skip: params.skip,
    take: params.take,
  });
}

export async function getRevisionService(deps: Deps, revisionId: string) {
  const revision = await findRevisionById(deps.prisma, revisionId);
  if (!revision) {
    throw notFound('Revision not found');
  }
  return revision;
}

export async function approveRevisionService(
  deps: Deps,
  revisionId: string,
  input: ApproveRevisionInput,
  actorId: string | null
) {
  const revision = await findRevisionById(deps.prisma, revisionId);
  if (!revision) {
    throw notFound('Revision not found');
  }

  const extracted = revision.extracted as Record<string, unknown>;
  const edited = input.edited ?? revision.edited ?? undefined;
  const resolved = mergeJson(extracted, edited as Record<string, unknown> | undefined);

  const updatedRevision = await updateRevision(deps.prisma, revision.id, {
    status: 'APPROVED',
    edited: (input.edited as Prisma.InputJsonValue | undefined) ?? undefined,
    notes: input.notes ?? undefined,
    resolved: resolved as Prisma.InputJsonValue,
    approvedBy: actorId,
    approvedAt: deps.now(),
  });

  await updateListing(deps.prisma, revision.listingId, {
    selectedRevision: { connect: { id: revision.id } },
  });

  return updatedRevision;
}

export async function rejectRevisionService(
  deps: Deps,
  revisionId: string,
  notes: string | undefined,
  actorId: string | null
) {
  const revision = await findRevisionById(deps.prisma, revisionId);
  if (!revision) {
    throw notFound('Revision not found');
  }

  return updateRevision(deps.prisma, revision.id, {
    status: 'REJECTED',
    notes: notes ?? undefined,
    approvedBy: actorId,
    approvedAt: deps.now(),
  });
}
