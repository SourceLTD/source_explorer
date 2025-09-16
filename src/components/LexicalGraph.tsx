'use client';

import { MermaidDiagram } from '@lightenna/react-mermaid-diagram';
import { GraphNode } from '@/lib/types';

interface LexicalGraphProps {
  currentNode: GraphNode;
  onNodeClick: (nodeId: string) => void;
}

export default function LexicalGraph({ currentNode, onNodeClick }: LexicalGraphProps) {
  const generateMermaidDiagram = (node: GraphNode): string => {
    let diagram = 'graph TD\n';
    const nodeId = sanitizeId(node.id);
    
    // Define the current node
    const currentLabel = `${node.lemmas[0] || node.id}<br/><small>${truncateText(node.gloss, 30)}</small>`;
    diagram += `    ${nodeId}["${currentLabel}"]\n`;
    diagram += `    class ${nodeId} current-node\n`;
    
    // Add parent nodes (hypernyms)
    node.parents.forEach((parent, index) => {
      const parentId = sanitizeId(parent.id);
      const parentLabel = `${parent.lemmas[0] || parent.id}<br/><small>${truncateText(parent.gloss, 30)}</small>`;
      diagram += `    ${parentId}["${parentLabel}"]\n`;
      diagram += `    ${parentId} --> ${nodeId}\n`;
      diagram += `    class ${parentId} parent-node\n`;
    });
    
    // Add child nodes (hyponyms)
    node.children.forEach((child, index) => {
      const childId = sanitizeId(child.id);
      const childLabel = `${child.lemmas[0] || child.id}<br/><small>${truncateText(child.gloss, 30)}</small>`;
      diagram += `    ${childId}["${childLabel}"]\n`;
      diagram += `    ${nodeId} --> ${childId}\n`;
      diagram += `    class ${childId} child-node\n`;
    });
    
    // Add click events
    diagram += `    click ${nodeId} "javascript:handleNodeClick('${node.id}')"\n`;
    node.parents.forEach(parent => {
      const parentId = sanitizeId(parent.id);
      diagram += `    click ${parentId} "javascript:handleNodeClick('${parent.id}')"\n`;
    });
    node.children.forEach(child => {
      const childId = sanitizeId(child.id);
      diagram += `    click ${childId} "javascript:handleNodeClick('${child.id}')"\n`;
    });
    
    return diagram;
  };

  const sanitizeId = (id: string): string => {
    return id.replace(/[^a-zA-Z0-9]/g, '_');
  };

  const truncateText = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // Set up global click handler
  if (typeof window !== 'undefined') {
    (window as any).handleNodeClick = (nodeId: string) => {
      onNodeClick(nodeId);
    };
  }

  const diagramText = generateMermaidDiagram(currentNode);

  return (
    <div className="w-full h-full flex items-center justify-center bg-white rounded-lg shadow-sm border">
      <style jsx global>{`
        .current-node rect {
          fill: #3b82f6 !important;
          stroke: #1e40af !important;
          stroke-width: 2px !important;
        }
        .current-node .nodeLabel {
          color: white !important;
          font-weight: bold !important;
        }
        .parent-node rect {
          fill: #10b981 !important;
          stroke: #059669 !important;
        }
        .parent-node .nodeLabel {
          color: white !important;
        }
        .child-node rect {
          fill: #f59e0b !important;
          stroke: #d97706 !important;
        }
        .child-node .nodeLabel {
          color: white !important;
        }
        .node rect {
          cursor: pointer !important;
        }
        .node:hover rect {
          opacity: 0.8 !important;
        }
        .edgeLabel {
          background-color: white !important;
          border-radius: 4px !important;
          padding: 2px 4px !important;
          font-size: 12px !important;
        }
      `}</style>
      <MermaidDiagram>{diagramText}</MermaidDiagram>
    </div>
  );
}