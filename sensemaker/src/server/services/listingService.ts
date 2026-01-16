import type { Prisma, $Enums } from '@prisma/client';
import type { Deps } from '../deps';
import { notFound } from '../http/errors';
import { findListingWithSelectedRevision, listListings } from '../repositories/listingRepo';

export async function listListingsService(
  deps: Deps,
  params: {
    filters: {
      kind?: $Enums.ListingKind;
      orgName?: string;
    };
    sortField: string;
    sortOrder: 'asc' | 'desc';
    skip: number;
    take: number;
  }
) {
  const where: Prisma.ListingWhereInput = {};

  if (params.filters.kind) {
    where.kind = params.filters.kind;
  }

  if (params.filters.orgName) {
    where.orgName = { contains: params.filters.orgName, mode: 'insensitive' };
  }

  return listListings(deps.prisma, {
    where,
    orderBy: { [params.sortField]: params.sortOrder },
    skip: params.skip,
    take: params.take,
  });
}

export async function getListingService(deps: Deps, id: string) {
  const listing = await findListingWithSelectedRevision(deps.prisma, id);
  if (!listing) {
    throw notFound('Listing not found');
  }

  return listing;
}
