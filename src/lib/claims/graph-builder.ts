import type { Prisma } from '@prisma/client';
import type { ClaimsGraphPayload, ClaimsLink, ClaimsNode, ReferentialStatus } from './types';

type InstanceWithRelations = Prisma.instancesGetPayload<{
  include: {
    concepts: { select: { id: true; label: true } };
    instance_fillers_instance_fillers_instance_idToinstances: {
      include: {
        properties: { select: { id: true; label: true } };
        instances_instance_fillers_filler_instance_idToinstances: {
          include: {
            concepts: { select: { id: true; label: true } };
          };
        };
      };
    };
  };
}>;

function instanceLabel(instance: InstanceWithRelations): string {
  const meta = instance.metadata as Record<string, unknown> | null;
  if (meta?.label && typeof meta.label === 'string') {
    return meta.label;
  }
  return `${instance.concepts.label} #${instance.id}`;
}

export function buildClaimsGraphPayload(
  instances: InstanceWithRelations[],
  options?: { highlightIds?: Set<string>; includeConceptNodes?: boolean },
): ClaimsGraphPayload {
  const highlightIds = options?.highlightIds ?? new Set<string>();
  const includeConceptNodes = options?.includeConceptNodes ?? true;
  const nodes = new Map<string, ClaimsNode>();
  const links: ClaimsLink[] = [];

  for (const instance of instances) {
    const instanceId = instance.id.toString();
    nodes.set(instanceId, {
      id: instanceId,
      type: 'instance',
      label: instanceLabel(instance),
      conceptLabel: instance.concepts.label,
      conceptId: instance.concepts.id.toString(),
      confidence: instance.confidence ?? undefined,
      matched: highlightIds.size > 0 ? highlightIds.has(instanceId) : undefined,
      referentialStatus: instance.referential_status as ReferentialStatus,
    });

    if (includeConceptNodes) {
      const conceptId = `concept-${instance.concepts.id}`;
      if (!nodes.has(conceptId)) {
        nodes.set(conceptId, {
          id: conceptId,
          type: 'concept',
          label: instance.concepts.label,
          conceptId: instance.concepts.id.toString(),
        });
      }
      links.push({
        id: `typed-${instanceId}-${conceptId}`,
        source: instanceId,
        target: conceptId,
        type: 'typed_as',
      });
    }

    for (const filler of instance.instance_fillers_instance_fillers_instance_idToinstances) {
      const propertyLabel = filler.properties.label ?? `Property ${filler.property_id}`;
      if (filler.filler_instance_id && filler.instances_instance_fillers_filler_instance_idToinstances) {
        const targetInstance = filler.instances_instance_fillers_filler_instance_idToinstances;
        const targetId = targetInstance.id.toString();
        if (!nodes.has(targetId)) {
          nodes.set(targetId, {
            id: targetId,
            type: 'instance',
            label: instanceLabel(targetInstance as InstanceWithRelations),
            conceptLabel: targetInstance.concepts.label,
            conceptId: targetInstance.concepts.id.toString(),
            matched: highlightIds.size > 0 ? highlightIds.has(targetId) : undefined,
            referentialStatus: (targetInstance as InstanceWithRelations).referential_status as ReferentialStatus,
          });
        }
        links.push({
          id: `filler-${filler.id}`,
          source: instanceId,
          target: targetId,
          type: 'filler',
          propertyLabel,
        });
      } else if (filler.filler_value) {
        const primitiveId = `primitive-${filler.id}`;
        nodes.set(primitiveId, {
          id: primitiveId,
          type: 'instance',
          label: filler.filler_value,
          matched: highlightIds.size > 0 ? highlightIds.has(instanceId) : undefined,
        });
        links.push({
          id: `filler-${filler.id}`,
          source: instanceId,
          target: primitiveId,
          type: 'filler',
          propertyLabel,
          fillerValue: filler.filler_value,
        });
      }
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    links,
  };
}

export const instanceGraphInclude = {
  concepts: { select: { id: true, label: true } },
  instance_fillers_instance_fillers_instance_idToinstances: {
    include: {
      properties: { select: { id: true, label: true } },
      instances_instance_fillers_filler_instance_idToinstances: {
        include: {
          concepts: { select: { id: true, label: true } },
        },
      },
    },
  },
} satisfies Prisma.instancesInclude;
