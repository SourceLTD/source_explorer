/**
 * API Route: /api/changegroups
 * 
 * GET - List changegroups with optional filters
 * POST - Create a new changegroup
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createChangegroup, ChangegroupSource } from '@/lib/version-control';

// GET /api/changegroups - List changegroups
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const status = searchParams.get('status') as 'pending' | 'committed' | 'discarded' | null;
    const source = searchParams.get('source') as ChangegroupSource | null;
    const created_by = searchParams.get('created_by');
    const llm_job_id = searchParams.get('llm_job_id');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const page_size = parseInt(searchParams.get('page_size') || '20', 10);

    // Build where clause
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (source) where.source = source;
    if (created_by) where.created_by = created_by;
    if (llm_job_id) where.llm_job_id = BigInt(llm_job_id);

    // Get total count
    const total = await prisma.changegroups.count({ where });

    // Get changegroups with pagination
    const changegroups = await prisma.changegroups.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * page_size,
      take: page_size,
      include: {
        llm_jobs: {
          select: {
            id: true,
            label: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json({
      data: changegroups.map(cg => ({
        ...cg,
        id: cg.id.toString(),
        llm_job_id: cg.llm_job_id?.toString() ?? null,
      })),
      total,
      page,
      page_size,
      total_pages: Math.ceil(total / page_size),
    });
  } catch (error) {
    console.error('Error listing changegroups:', error);
    return NextResponse.json(
      { error: 'Failed to list changegroups' },
      { status: 500 }
    );
  }
}

// POST /api/changegroups - Create a new changegroup
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { source, label, description, llm_job_id, created_by } = body;

    if (!source || !created_by) {
      return NextResponse.json(
        { error: 'source and created_by are required' },
        { status: 400 }
      );
    }

    const changegroup = await createChangegroup({
      source,
      label,
      description,
      llm_job_id: llm_job_id ? BigInt(llm_job_id) : undefined,
      created_by,
    });

    return NextResponse.json({
      ...changegroup,
      id: changegroup.id.toString(),
      llm_job_id: changegroup.llm_job_id?.toString() ?? null,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating changegroup:', error);
    return NextResponse.json(
      { error: 'Failed to create changegroup' },
      { status: 500 }
    );
  }
}

