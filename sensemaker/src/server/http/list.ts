import { z } from 'zod';
import { badRequest } from './errors';

export type SortOrder = 'asc' | 'desc';

export interface ListParams<TFilters> {
  page: number;
  pageSize: number;
  sortField: string;
  sortOrder: SortOrder;
  skip: number;
  take: number;
  filters: TFilters;
}

type FilterSchema<T> = z.ZodType<T>;

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function normalizeSortOrder(order: string | null | undefined): SortOrder {
  if (!order) return 'desc';
  const normalized = order.toLowerCase();
  return normalized === 'asc' ? 'asc' : 'desc';
}

export function parseListParams<TFilters>(
  request: Request,
  filterSchema: FilterSchema<TFilters>,
  options: {
    defaultSort: string;
    allowedSort: readonly string[];
    filterKeys: readonly string[];
  }
): ListParams<TFilters> {
  const url = new URL(request.url);

  const sortParam = safeJsonParse<[string, string]>(url.searchParams.get('sort'));
  const rangeParam = safeJsonParse<[number, number]>(url.searchParams.get('range'));
  const filterParam = safeJsonParse<Record<string, unknown>>(url.searchParams.get('filter'));

  let sortField = sortParam?.[0] ?? url.searchParams.get('sort') ?? options.defaultSort;
  let sortOrder = normalizeSortOrder(sortParam?.[1] ?? url.searchParams.get('order'));

  if (!options.allowedSort.includes(sortField)) {
    sortField = options.defaultSort;
  }

  let page = Number(url.searchParams.get('page') ?? 1);
  let pageSize = Number(url.searchParams.get('pageSize') ?? 20);

  if (Number.isNaN(page) || page < 1) page = 1;
  if (Number.isNaN(pageSize) || pageSize < 1) pageSize = 20;

  if (rangeParam && rangeParam.length >= 2) {
    const start = Math.max(0, Number(rangeParam[0] ?? 0));
    const end = Math.max(start, Number(rangeParam[1] ?? start));
    pageSize = end - start + 1;
    page = Math.floor(start / pageSize) + 1;
  }

  const filterFromQuery: Record<string, unknown> = {};
  for (const key of options.filterKeys) {
    const value = url.searchParams.get(key);
    if (value !== null) {
      filterFromQuery[key] = value;
    }
  }

  const mergedFilters = { ...(filterParam ?? {}), ...filterFromQuery };
  const parsedFilters = filterSchema.safeParse(mergedFilters);
  if (!parsedFilters.success) {
    throw badRequest('Invalid filters', parsedFilters.error.flatten());
  }

  const skip = (page - 1) * pageSize;
  const take = pageSize;

  return {
    page,
    pageSize,
    sortField,
    sortOrder,
    skip,
    take,
    filters: parsedFilters.data,
  };
}

export function buildContentRange(resource: string, start: number, end: number, total: number): string {
  return `${resource} ${start}-${end}/${total}`;
}

export function computeRange(start: number, count: number): { start: number; end: number } {
  if (count === 0) return { start: 0, end: 0 };
  return { start, end: start + count - 1 };
}
