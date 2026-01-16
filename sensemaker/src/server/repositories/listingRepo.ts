import type { Prisma, PrismaClient } from '@prisma/client';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export async function upsertListing(
  prisma: DbClient,
  args: { canonicalKey: string; create: Prisma.ListingCreateInput; update: Prisma.ListingUpdateInput }
) {
  return prisma.listing.upsert({
    where: { canonicalKey: args.canonicalKey },
    create: args.create,
    update: args.update,
  });
}

export async function updateListing(
  prisma: DbClient,
  id: string,
  data: Prisma.ListingUpdateInput
) {
  return prisma.listing.update({ where: { id }, data });
}

export async function findListingById(prisma: DbClient, id: string) {
  return prisma.listing.findUnique({ where: { id } });
}

export async function findListingWithSelectedRevision(prisma: DbClient, id: string) {
  return prisma.listing.findUnique({
    where: { id },
    include: { selectedRevision: true },
  });
}

export async function listListings(
  prisma: DbClient,
  args: {
    where: Prisma.ListingWhereInput;
    orderBy: Prisma.ListingOrderByWithRelationInput;
    skip: number;
    take: number;
  }
) {
  const [items, total] = await Promise.all([
    prisma.listing.findMany({
      where: args.where,
      orderBy: args.orderBy,
      skip: args.skip,
      take: args.take,
    }),
    prisma.listing.count({ where: args.where }),
  ]);

  return { items, total };
}
