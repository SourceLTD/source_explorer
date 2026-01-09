/**
 * API Route: /api/changesets/batch
 * 
 * POST - Batch commit or discard changesets by:
 *   - llm_job_id (for LLM job changes)
 *   - created_by (for manual changes)
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  commitByLlmJob,
  commitByUser,
  discardByLlmJob,
  discardByUser,
} from '@/lib/version-control';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { 
      action,  // 'commit' or 'discard'
      llm_job_id,
      created_by,
      committed_by,  // Required for commit action
    } = body;

    if (!action || (action !== 'commit' && action !== 'discard')) {
      return NextResponse.json(
        { error: 'action must be "commit" or "discard"' },
        { status: 400 }
      );
    }

    if (!llm_job_id && !created_by) {
      return NextResponse.json(
        { error: 'Either llm_job_id or created_by is required' },
        { status: 400 }
      );
    }

    if (action === 'commit' && !committed_by) {
      return NextResponse.json(
        { error: 'committed_by is required for commit action' },
        { status: 400 }
      );
    }

    if (action === 'commit') {
      if (llm_job_id) {
        const result = await commitByLlmJob(BigInt(llm_job_id), committed_by);
        return NextResponse.json({
          action: 'commit',
          target: { llm_job_id },
          ...result,
        });
      } else {
        const result = await commitByUser(created_by, committed_by);
        return NextResponse.json({
          action: 'commit',
          target: { created_by },
          ...result,
        });
      }
    } else {
      // discard
      if (llm_job_id) {
        await discardByLlmJob(BigInt(llm_job_id));
        return NextResponse.json({
          action: 'discard',
          target: { llm_job_id },
          success: true,
        });
      } else {
        await discardByUser(created_by);
        return NextResponse.json({
          action: 'discard',
          target: { created_by },
          success: true,
        });
      }
    }
  } catch (error) {
    console.error('Error performing batch operation:', error);
    return NextResponse.json(
      { error: 'Failed to perform batch operation' },
      { status: 500 }
    );
  }
}

