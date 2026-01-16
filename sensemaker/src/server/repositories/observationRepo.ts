import type { Prisma, PrismaClient } from '@prisma/client';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export async function createObservation(
  prisma: DbClient,
  data: Prisma.ObservationCreateInput
) {
  return prisma.observation.create({ data });
}

export async function findObservationById(prisma: DbClient, id: string) {
  return prisma.observation.findUnique({ where: { id } });
}

export async function updateObservation(
  prisma: DbClient,
  id: string,
  data: Prisma.ObservationUpdateInput
) {
  return prisma.observation.update({ where: { id }, data });
}

export async function listObservations(
  prisma: DbClient,
  args: {
    where: Prisma.ObservationWhereInput;
    orderBy: Prisma.ObservationOrderByWithRelationInput;
    skip: number;
    take: number;
  }
) {
  const [items, total] = await Promise.all([
    prisma.observation.findMany({
      where: args.where,
      orderBy: args.orderBy,
      skip: args.skip,
      take: args.take,
    }),
    prisma.observation.count({ where: args.where }),
  ]);

  return { items, total };
}
