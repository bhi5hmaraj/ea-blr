import type { Prisma, PrismaClient } from '@prisma/client';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export async function createRevision(
  prisma: DbClient,
  data: Prisma.RevisionCreateInput
) {
  return prisma.revision.create({ data });
}

export async function updateRevision(
  prisma: DbClient,
  id: string,
  data: Prisma.RevisionUpdateInput
) {
  return prisma.revision.update({ where: { id }, data });
}

export async function findRevisionById(prisma: DbClient, id: string) {
  return prisma.revision.findUnique({ where: { id } });
}

export async function listRevisions(
  prisma: DbClient,
  args: {
    where: Prisma.RevisionWhereInput;
    orderBy: Prisma.RevisionOrderByWithRelationInput;
    skip: number;
    take: number;
  }
) {
  const [items, total] = await Promise.all([
    prisma.revision.findMany({
      where: args.where,
      orderBy: args.orderBy,
      skip: args.skip,
      take: args.take,
    }),
    prisma.revision.count({ where: args.where }),
  ]);

  return { items, total };
}
