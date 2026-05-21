import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { ClaimsQueryFilter } from './query-schema';
import { buildClaimsGraphPayload, instanceGraphInclude } from './graph-builder';

async function resolveConceptIdsByLabels(labels: string[]): Promise<bigint[]> {
  if (labels.length === 0) return [];
  const concepts = await prisma.concepts.findMany({
    where: {
      deleted: false,
      label: { in: labels, mode: 'insensitive' },
    },
    select: { id: true },
  });
  return concepts.map((c) => c.id);
}

async function resolvePropertyIdsByLabels(labels: string[]): Promise<Map<string, bigint[]>> {
  const properties = await prisma.properties.findMany({
    where: {
      label: { in: labels, mode: 'insensitive' },
    },
    select: { id: true, label: true },
  });
  const map = new Map<string, bigint[]>();
  for (const prop of properties) {
    const key = (prop.label ?? '').toLowerCase();
    const existing = map.get(key) ?? [];
    existing.push(prop.id);
    map.set(key, existing);
  }
  return map;
}

export async function executeClaimsQuery(
  graphId: bigint,
  filter: ClaimsQueryFilter,
): Promise<{ matchedInstanceIds: bigint[]; explanation: string }> {
  const where: Prisma.instancesWhereInput = {
    knowledge_graph_id: graphId,
  };

  if (filter.minConfidence != null) {
    where.confidence = { gte: filter.minConfidence };
  }

  if (filter.conceptLabels?.length) {
    const conceptIds = await resolveConceptIdsByLabels(filter.conceptLabels);
    if (conceptIds.length === 0) {
      return { matchedInstanceIds: [], explanation: filter.explanation };
    }
    where.concept_id = { in: conceptIds };
  }

  let matched = await prisma.instances.findMany({
    where,
    select: { id: true },
  });

  if (filter.propertyFilters?.length) {
    const propertyLabels = filter.propertyFilters.map((f) => f.propertyLabel);
    const propertyMap = await resolvePropertyIdsByLabels(propertyLabels);

    for (const pf of filter.propertyFilters) {
      const propertyIds = propertyMap.get(pf.propertyLabel.toLowerCase()) ?? [];
      if (propertyIds.length === 0) {
        matched = [];
        break;
      }

      const fillerWhere: Prisma.instance_fillersWhereInput = {
        property_id: { in: propertyIds },
      };

      if (pf.fillerValueContains) {
        fillerWhere.filler_value = { contains: pf.fillerValueContains, mode: 'insensitive' };
      }

      if (pf.fillerConceptLabel) {
        const fillerConceptIds = await resolveConceptIdsByLabels([pf.fillerConceptLabel]);
        if (fillerConceptIds.length === 0) {
          matched = [];
          break;
        }
        fillerWhere.instances_instance_fillers_filler_instance_idToinstances = {
          concept_id: { in: fillerConceptIds },
        };
      }

      const fillers = await prisma.instance_fillers.findMany({
        where: fillerWhere,
        select: { instance_id: true },
      });
      const allowedIds = new Set(fillers.map((f) => f.instance_id.toString()));
      matched = matched.filter((m) => allowedIds.has(m.id.toString()));
    }
  }

  let matchedIds = matched.map((m) => m.id);

  if (filter.expandNeighborhood && matchedIds.length > 0) {
    const neighborFillers = await prisma.instance_fillers.findMany({
      where: {
        OR: [
          { instance_id: { in: matchedIds } },
          { filler_instance_id: { in: matchedIds } },
        ],
      },
      select: { instance_id: true, filler_instance_id: true },
    });
    const expanded = new Set(matchedIds.map(String));
    for (const f of neighborFillers) {
      expanded.add(f.instance_id.toString());
      if (f.filler_instance_id) expanded.add(f.filler_instance_id.toString());
    }
    matchedIds = Array.from(expanded).map((id) => BigInt(id));
  }

  return {
    matchedInstanceIds: matchedIds,
    explanation: filter.explanation,
  };
}

export async function loadGraphInstances(
  graphId: bigint,
  instanceIds?: bigint[],
) {
  const where: Prisma.instancesWhereInput = {
    knowledge_graph_id: graphId,
  };
  if (instanceIds?.length) {
    where.id = { in: instanceIds };
  }

  return prisma.instances.findMany({
    where,
    include: instanceGraphInclude,
  });
}

export async function buildGraphForInstances(
  graphId: bigint,
  matchedInstanceIds: bigint[],
  expandNeighborhood: boolean,
) {
  let instanceIds = matchedInstanceIds;

  if (expandNeighborhood && matchedInstanceIds.length > 0) {
    const neighborFillers = await prisma.instance_fillers.findMany({
      where: {
        OR: [
          { instance_id: { in: matchedInstanceIds } },
          { filler_instance_id: { in: matchedInstanceIds } },
        ],
        instances_instance_fillers_instance_idToinstances: {
          knowledge_graph_id: graphId,
        },
      },
      select: { instance_id: true, filler_instance_id: true },
    });
    const expanded = new Set(matchedInstanceIds.map(String));
    for (const f of neighborFillers) {
      expanded.add(f.instance_id.toString());
      if (f.filler_instance_id) expanded.add(f.filler_instance_id.toString());
    }
    instanceIds = Array.from(expanded).map((id) => BigInt(id));
  }

  const instances = instanceIds.length > 0
    ? await loadGraphInstances(graphId, instanceIds)
    : await loadGraphInstances(graphId);

  const highlightIds = new Set(matchedInstanceIds.map(String));
  return buildClaimsGraphPayload(instances, { highlightIds, includeConceptNodes: false });
}
