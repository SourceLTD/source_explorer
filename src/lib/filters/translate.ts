import { prisma } from '@/lib/prisma';
import type { PartOfSpeech } from '@/lib/llm/types';
import { getFieldConfigsForPos } from './config';
import type { BooleanFilterGroup, BooleanFilterNode, BooleanFilterRule, TranslateResult, PostFilterCondition } from './types';

export async function translateFilterASTToPrisma(pos: PartOfSpeech, root?: BooleanFilterGroup): Promise<TranslateResult> {
  if (!root || root.children.length === 0) {
    return { where: {}, computedFilters: [] };
  }

  const fields = getFieldConfigsForPos(pos);
  const computedFilters: PostFilterCondition[] = [];

  async function visit(node: BooleanFilterNode): Promise<Record<string, unknown>> {
    if (node.kind === 'group') {
      const children = await Promise.all(node.children.map(visit));
      if (children.length === 0) return {};
      if (node.op === 'and') return { AND: children.filter(Boolean) };
      return { OR: children.filter(Boolean) };
    }
    return await ruleToWhere(node);
  }

  async function ruleToWhere(rule: BooleanFilterRule): Promise<Record<string, unknown>> {
    const cfg = fields.find(f => f.key === rule.field);
    if (!cfg) return {};

    // computed counts handled later
    if (cfg.type === 'computed_number') {
      const op = String(rule.operator) as PostFilterCondition['operator'];
      const value = Number(rule.value ?? 0);
      const value2 = rule.value2 !== undefined ? Number(rule.value2) : undefined;
      if (rule.field === 'parentsCount' || rule.field === 'childrenCount') {
        computedFilters.push({ field: rule.field as PostFilterCondition['field'], operator: op, value, value2 });
      }
      return {};
    }

    // frame special lookup for verbs
    if (cfg.type === 'frame' && pos === 'verbs') {
      const values = normalizeToArray(rule.value);
      const ids = await resolveFrameIds(values);
      if (ids.length === 0) return { id: undefined }; // no matches -> empty set when ANDed
      if (rule.operator === 'equals' && ids.length > 0) {
        return { [cfg.db as string]: ids[0] };
      }
      return { [cfg.db as string]: { in: ids } };
    }

    switch (cfg.type) {
      case 'text':
        return textWhere(cfg.db as string, rule);
      case 'string_array':
        return arrayWhere(cfg.db as string, rule);
      case 'enum':
        return enumWhere(cfg.db as string, rule);
      case 'boolean':
        return { [cfg.db as string]: Boolean(rule.value) };
      case 'number': {
        const v = Number(rule.value);
        return numberWhere(cfg.db as string, rule.operator, v, rule.value2 !== undefined ? Number(rule.value2) : undefined);
      }
      case 'date': {
        return dateWhere(cfg.db as string, rule);
      }
      default:
        return {};
    }
  }

  const where = await visit(root);
  return { where, computedFilters };
}

function textWhere(field: string, rule: BooleanFilterRule): Record<string, unknown> {
  const val = String(rule.value ?? '').trim();
  if (!val) return {};
  if (rule.operator === 'not_contains') return { NOT: { [field]: { contains: val, mode: 'insensitive' } } } as Record<string, unknown>;
  if (rule.operator === 'starts_with') return { [field]: { startsWith: val, mode: 'insensitive' } } as Record<string, unknown>;
  if (rule.operator === 'ends_with') return { [field]: { endsWith: val, mode: 'insensitive' } } as Record<string, unknown>;
  return { [field]: { contains: val, mode: 'insensitive' } } as Record<string, unknown>;
}

function arrayWhere(field: string, rule: BooleanFilterRule): Record<string, unknown> {
  const isArrayOp = rule.operator === 'hasSome' || rule.operator === 'hasEvery';
  const values = isArrayOp ? normalizeToArray(rule.value) : [String(rule.value ?? '').trim()].filter(Boolean);
  if (values.length === 0) return {};
  if (rule.operator === 'hasEvery') return { [field]: { hasEvery: values } } as Record<string, unknown>;
  if (rule.operator === 'hasSome') return { [field]: { hasSome: values } } as Record<string, unknown>;
  if (rule.operator === 'not_has') return { NOT: { [field]: { has: values[0] } } } as Record<string, unknown>;
  return { [field]: { has: values[0] } } as Record<string, unknown>;
}

function enumWhere(field: string, rule: BooleanFilterRule): Record<string, unknown> {
  const values = normalizeToArray(rule.value);
  if (values.length === 0) return {};
  if (rule.operator === 'not_in') return { NOT: { [field]: { in: values } } } as Record<string, unknown>;
  if (rule.operator === 'in') return { [field]: { in: values } } as Record<string, unknown>;
  return { [field]: values[0] } as Record<string, unknown>;
}

function numberWhere(field: string, op: string, v: number, v2?: number): Record<string, unknown> {
  switch (op) {
    case 'eq':
      return { [field]: v } as Record<string, unknown>;
    case 'neq':
      return { NOT: { [field]: v } } as Record<string, unknown>;
    case 'gt':
      return { [field]: { gt: v } } as Record<string, unknown>;
    case 'gte':
      return { [field]: { gte: v } } as Record<string, unknown>;
    case 'lt':
      return { [field]: { lt: v } } as Record<string, unknown>;
    case 'lte':
      return { [field]: { lte: v } } as Record<string, unknown>;
    case 'between':
      if (v2 === undefined) return {};
      return { [field]: { gte: v, lte: v2 } } as Record<string, unknown>;
    default:
      return {};
  }
}

function dateWhere(field: string, rule: BooleanFilterRule): Record<string, unknown> {
  const v = String(rule.value ?? '').trim();
  const v2 = rule.value2 ? String(rule.value2) : undefined;
  if (!v) return {};
  if (rule.operator === 'after') return { [field]: { gte: new Date(v) } } as Record<string, unknown>;
  if (rule.operator === 'before') return { [field]: { lte: new Date(v + 'T23:59:59.999Z') } } as Record<string, unknown>;
  if (rule.operator === 'between' && v2) {
    return { [field]: { gte: new Date(v), lte: new Date(v2 + 'T23:59:59.999Z') } } as Record<string, unknown>;
  }
  return {};
}

function normalizeToArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
  const s = String(val ?? '').trim();
  if (!s) return [];
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

async function resolveFrameIds(values: string[]): Promise<bigint[]> {
  if (values.length === 0) return [];
  const or = values.map(v =>
    v.match(/^\d+$/)
      ? { id: BigInt(v) }
      : { frame_name: { equals: v, mode: 'insensitive' as const } }
  );
  const frames = await prisma.frames.findMany({ where: { OR: or } as never, select: { id: true } });
  return frames.map(f => f.id);
}


