'use client';

import React, { useMemo, useState } from 'react';
import RecipesGraph from '@/components/RecipesGraph';
import { GraphNode, LogicNode, Recipe, RecipePredicateNode, RecipeRelationType } from '@/lib/types';

// --- Helpers to build rich dummy data ---
function verbNode(id: string, gloss: string): GraphNode {
  return {
    id,
    numericId: id,
    legacy_id: id,
    lemmas: [id.split('.v.')[0]],
    src_lemmas: [],
    gloss,
    pos: 'v',
    lexfile: 'verb.cognition',
    examples: [],
    parents: [],
    children: [],
    entails: [],
    causes: [],
    alsoSee: [],
    concrete: true,
  } as GraphNode;
}

function pred(id: string, gloss: string, opts?: Partial<RecipePredicateNode>): RecipePredicateNode {
  return {
    id,
    alias: opts?.alias ?? null,
    position: opts?.position ?? null,
    optional: opts?.optional ?? false,
    negated: opts?.negated ?? false,
    example: opts?.example ?? null,
    lexical: verbNode(id, gloss),
    roleMappings: opts?.roleMappings ?? [],
  };
}

function edge(source: string, target: string, type: RecipeRelationType) {
  return { sourcePredicateId: source, targetPredicateId: target, relation_type: type } as const;
}

function buildComplexRecipes(): { current: GraphNode; recipes: Recipe[] } {
  // Main/current node
  const current: GraphNode = {
    id: 'investigate.v.00',
    numericId: 'investigate.v.00',
    legacy_id: 'investigate.v.00',
    lemmas: ['investigate'],
    src_lemmas: [],
    gloss: 'to carry out a systematic inquiry to discover facts',
    pos: 'v',
    lexfile: 'verb.cognition',
    examples: ['investigate the scene', 'investigate allegations thoroughly'],
    parents: [],
    children: [],
    entails: [],
    causes: [],
    alsoSee: [],
    vendler_class: 'activity',
    frame: {
      id: 'frame-1',
      label: 'INVESTIGATION',
      definition: 'Conducting an investigation',
      short_definition: 'Investigative activity',
      prototypical_synset: 'investigate.v.01',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    roles: [
      { id: 'r-agent', role_type: { id: 'rt1', code: 'agent.rl', label: 'AGENT', generic_description: 'Performer of the act' }, main: true, description: 'investigator', example_sentence: 'The detective investigated the case.', instantiation_type_ids: [] },
      { id: 'r-theme', role_type: { id: 'rt2', code: 'theme.rl', label: 'THEME', generic_description: 'Entity undergoing action' }, main: false, description: 'case or event', example_sentence: 'The detective investigated the robbery.', instantiation_type_ids: [] },
      { id: 'r-time', role_type: { id: 'rt3', code: 'time.rl', label: 'TIME', generic_description: 'Time of event' }, main: false, description: 'time of investigation', example_sentence: '', instantiation_type_ids: [] },
    ],
    role_groups: [
      { id: 'rg1', description: 'Speaker roles (oneOf)', require_at_least_one: true, role_ids: ['r-agent', 'r-theme'] },
    ],
  } as GraphNode;

  // A rich set of predicates
  const P = {
    act: pred('act.v.06', 'perform an action'),
    perceive: pred('perceive.v.02', 'become aware through senses'),
    prepare: pred('prepare.v.01', 'make ready for use'),
    decide: pred('decide.v.01', 'reach a conclusion'),
    communicate: pred('communicate.v.01', 'transmit information to others'),
    analyze: pred('analyze.v.01', 'examine methodically', { lexical: { ...verbNode('analyze.v.01', 'examine methodically'), concrete: false } as GraphNode }),
    start: pred('start.v.01', 'begin an activity'),
    finish: pred('finish.v.01', 'bring to an end'),
    monitor: pred('monitor.v.01', 'observe and check'),
    recover: pred('recover.v.01', 'return to a normal state'),
    log: pred('log.v.02', 'record systematically'),
    validate: pred('validate.v.01', 'check or prove validity'),
  } as const;

  // Relations now ONLY within AND groups (no cross-group relations)
  const relationsA = [
    // AND group g2: decide & analyze (+ validate)
    edge(P.analyze.id, P.decide.id, 'precedes'),
    edge(P.validate.id, P.decide.id, 'precedes'),
    // AND group g3-and: start, finish, log
    edge(P.start.id, P.finish.id, 'precedes'),
    edge(P.log.id, P.finish.id, 'precedes'),
    // AND group g4: monitor, perceive, communicate
    edge(P.monitor.id, P.perceive.id, 'enables'),
    edge(P.perceive.id, P.communicate.id, 'during'),
  ] as const;

  // Logic tree: AND root with a mix of groups.
  //   - OR group (act | prepare) — choice, no relations allowed.
  //   - AND group (decide, analyze, validate) — has relations.
  //   - AND group (start, finish, log) — has relations.
  //   - AND group (monitor, perceive, communicate) — has relations.
  const leaf = (nodeId: string, predicate: RecipePredicateNode): LogicNode => ({ id: `leaf:${nodeId}`, recipe_id: 'rA', kind: 'leaf', description: null, target_predicate_id: predicate.id, target_predicate: predicate, children: [] });
  const and = (id: string, ...children: LogicNode[]): LogicNode => ({ id: `and:${id}`, recipe_id: 'rA', kind: 'and', description: 'all', children });
  const or = (id: string, ...children: LogicNode[]): LogicNode => ({ id: `or:${id}`, recipe_id: 'rA', kind: 'or', description: 'oneOf', children });

  const logicA: LogicNode = and(
    'root',
    or('g1', leaf('act', P.act), leaf('prepare', P.prepare)),
    and('g2', leaf('decide', P.decide), leaf('analyze', P.analyze), leaf('validate', P.validate)),
    and('g3and', leaf('start', P.start), leaf('finish', P.finish), leaf('log', P.log)),
    and('g4', leaf('monitor', P.monitor), leaf('perceive', P.perceive), leaf('communicate', P.communicate))
  );

  const recipeA: Recipe = {
    id: 'rA',
    label: 'Complex Flow A',
    description: 'AND of groups with nested OR/NOT; dense relations',
    is_default: true,
    predicates: Object.values(P),
    predicate_groups: [],
    relations: relationsA as any,
    preconditions: [],
    variables: [],
    logic_root: logicA,
  };

  // Second recipe variant: more predicates and criss-cross relations
  const Q = {
    discover: pred('discover.v.01', 'find unexpectedly'),
    hypothesize: pred('hypothesize.v.01', 'propose an explanation'),
    test: pred('test.v.01', 'perform a test'),
    conclude: pred('conclude.v.01', 'arrive at judgment'),
    publish: pred('publish.v.01', 'make public'),
    debate: pred('debate.v.01', 'discuss reasons for and against'),
  } as const;

  const relationsB = [
    // Only within AND groups
    edge(Q.discover.id, Q.hypothesize.id, 'causes'),
    edge(Q.hypothesize.id, Q.test.id, 'enables'),
    edge(Q.test.id, Q.conclude.id, 'precedes'),
    edge(Q.publish.id, Q.debate.id, 'precedes'),
  ] as const;

  const logicB: LogicNode = {
    id: 'rootB',
    recipe_id: 'rB',
    kind: 'or',
    description: 'oneOf',
    children: [
      { id: 'andB1', recipe_id: 'rB', kind: 'and', description: 'all', children: [
        leaf('discover', Q.discover),
        leaf('hypo', Q.hypothesize),
        leaf('test', Q.test),
        leaf('conclude', Q.conclude),
      ]},
      { id: 'andB2', recipe_id: 'rB', kind: 'and', description: 'all', children: [
        leaf('publish', Q.publish),
        leaf('debate', Q.debate),
      ]},
    ]
  };

  const recipeB: Recipe = {
    id: 'rB',
    label: 'Exploration Cycle B',
    description: 'OR at root with nested AND and feedback relations',
    is_default: false,
    predicates: Object.values(Q),
    predicate_groups: [],
    relations: relationsB as any,
    preconditions: [],
    variables: [],
    logic_root: logicB,
  };

  return { current, recipes: [recipeA, recipeB] };
}

export default function RecipesTestPage() {
  const { current, recipes } = useMemo(buildComplexRecipes, []);
  const [selectedId, setSelectedId] = useState<string | undefined>(recipes[0]?.id);

  return (
    <div className="w-full h-[calc(100vh-60px)] overflow-auto p-4">
      <div className="mb-3 text-sm text-gray-600">
        This page renders a heavyweight dummy dataset for the Recipe Diagram. Use the round arrows below the main node to toggle recipes.
      </div>
      <RecipesGraph
        currentNode={current}
        recipes={recipes}
        selectedRecipeId={selectedId}
        onSelectRecipe={(id) => setSelectedId(id)}
        onNodeClick={() => { /* no-op for test */ }}
      />
    </div>
  );
}


