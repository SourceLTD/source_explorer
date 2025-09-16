import { PrismaClient, RelationType } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed...')

  // Sample lexical entries
  const sampleEntries = [
    {
      id: 'dog.n.01',
      gloss: 'a member of the genus Canis (probably descended from the common wolf) that has been domesticated by man since prehistoric times; occurs in many breeds',
      pos: 'n',
      lexfile: 'noun.animal',
      lemmas: ['dog', 'domestic_dog', 'Canis_familiaris'],
      examples: ['the dog barked all night']
    },
    {
      id: 'animal.n.01',
      gloss: 'a living organism characterized by voluntary movement',
      pos: 'n',
      lexfile: 'noun.animal',
      lemmas: ['animal', 'animate_being', 'beast', 'brute', 'creature', 'fauna'],
      examples: ['animals in the zoo']
    },
    {
      id: 'run.v.01',
      gloss: 'move fast by using one\'s feet, with one foot off the ground at any given time',
      pos: 'v',
      lexfile: 'verb.motion',
      lemmas: ['run'],
      frames: ['Somebody ----s', 'Somebody ----s PP'],
      examples: ['Don\'t run--you\'ll be out of breath', 'The children ran to the store']
    },
    {
      id: 'fast.a.01',
      gloss: 'acting or moving or capable of acting or moving quickly',
      pos: 'a',
      lexfile: 'adj.all',
      lemmas: ['fast'],
      examples: ['fast cars', 'a fast typist']
    },
    {
      id: 'quickly.r.01',
      gloss: 'with rapid movements',
      pos: 'r',
      lexfile: 'adv.all',
      lemmas: ['quickly', 'rapidly', 'speedily', 'chop-chop', 'apace'],
      examples: ['he works quickly']
    }
  ]

  // Insert sample entries
  for (const entry of sampleEntries) {
    await prisma.lexicalEntry.upsert({
      where: { id: entry.id },
      update: {},
      create: entry
    })
  }

  // Sample relations
  const sampleRelations = [
    { sourceId: 'dog.n.01', targetId: 'animal.n.01', type: 'hypernym' as RelationType },
    { sourceId: 'animal.n.01', targetId: 'dog.n.01', type: 'hyponym' as RelationType },
    { sourceId: 'run.v.01', targetId: 'fast.a.01', type: 'also_see' as RelationType },
    { sourceId: 'fast.a.01', targetId: 'quickly.r.01', type: 'also_see' as RelationType }
  ]

  // Insert sample relations
  for (const relation of sampleRelations) {
    await prisma.entryRelation.upsert({
      where: {
        sourceId_type_targetId: {
          sourceId: relation.sourceId,
          targetId: relation.targetId,
          type: relation.type
        }
      },
      update: {},
      create: relation
    })
  }

  console.log('✅ Seed completed successfully!')
  console.log(`📊 Created ${sampleEntries.length} lexical entries`)
  console.log(`🔗 Created ${sampleRelations.length} relations`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })