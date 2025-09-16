import { prisma } from './prisma';
import { RelationType, type EntryWithRelations, type GraphNode, type SearchResult } from './types';

export async function getEntryById(id: string): Promise<EntryWithRelations | null> {
  return await prisma.lexicalEntry.findUnique({
    where: { id },
    include: {
      sourceRelations: {
        include: {
          target: true,
        },
      },
      targetRelations: {
        include: {
          source: true,
        },
      },
    },
  });
}

export async function searchEntries(query: string, limit = 20): Promise<SearchResult[]> {
  // Use PostgreSQL full-text search
  const results = await prisma.$queryRaw<SearchResult[]>`
    SELECT 
      id,
      lemmas,
      gloss,
      pos,
      ts_rank(gloss_tsv, plainto_tsquery('english', ${query})) +
      ts_rank(examples_tsv, plainto_tsquery('english', ${query})) as rank
    FROM lexical_entries
    WHERE 
      gloss_tsv @@ plainto_tsquery('english', ${query}) OR
      examples_tsv @@ plainto_tsquery('english', ${query}) OR
      ${query} = ANY(lemmas)
    ORDER BY rank DESC, id
    LIMIT ${limit}
  `;

  return results;
}

export async function getGraphNode(entryId: string): Promise<GraphNode | null> {
  const entry = await getEntryById(entryId);
  if (!entry) return null;

  // Get parents (hypernyms)
  const parents: GraphNode[] = [];
  for (const relation of entry.targetRelations) {
    if (relation.type === RelationType.HYPERNYM && relation.source) {
      parents.push({
        id: relation.source.id,
        lemmas: relation.source.lemmas,
        gloss: relation.source.gloss,
        pos: relation.source.pos,
        parents: [],
        children: [],
      });
    }
  }

  // Get children (hyponyms)
  const children: GraphNode[] = [];
  for (const relation of entry.sourceRelations) {
    if (relation.type === RelationType.HYPONYM && relation.target) {
      children.push({
        id: relation.target.id,
        lemmas: relation.target.lemmas,
        gloss: relation.target.gloss,
        pos: relation.target.pos,
        parents: [],
        children: [],
      });
    }
  }

  return {
    id: entry.id,
    lemmas: entry.lemmas,
    gloss: entry.gloss,
    pos: entry.pos,
    parents,
    children,
  };
}

export async function getAncestorPath(entryId: string): Promise<GraphNode[]> {
  const path: GraphNode[] = [];
  let currentId = entryId;

  while (currentId) {
    const node = await getGraphNode(currentId);
    if (!node) break;

    path.unshift(node);

    // Find the first parent (hypernym) to continue the path
    const parent = node.parents[0];
    if (parent) {
      currentId = parent.id;
    } else {
      break;
    }
  }

  return path;
}