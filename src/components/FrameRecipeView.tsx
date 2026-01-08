'use client';

import React, { useState, useMemo } from 'react';
import { FrameGraphNode, FrameRecipeData, FrameRelationType } from '@/lib/types';

interface FrameRecipeViewProps {
  currentFrame: FrameGraphNode;
  recipeData: FrameRecipeData | null;
  onFrameClick: (frameId: string) => void;
  onVerbClick: (verbId: string) => void;
  onEditClick?: () => void;
}

// Relation type display labels
const RELATION_LABELS: Record<FrameRelationType, string> = {
  'causes': 'Causes',
  'inherits_from': 'Inherits From',
  'inherited_by': 'Inherited By',
  'uses': 'Uses',
  'used_by': 'Used By',
  'subframe_of': 'Subframe Of',
  'has_subframe': 'Has Subframe',
  'precedes': 'Precedes',
  'preceded_by': 'Preceded By',
  'perspective_on': 'Perspective On',
  'perspectivized_in': 'Perspectivized In',
  'see_also': 'See Also',
  'reframing_mapping': 'Reframing',
  'metaphor': 'Metaphor',
};

// Vendler class colors
const VENDLER_COLORS = {
  state: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' },
  activity: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' },
  accomplishment: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' },
  achievement: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' },
};

export default function FrameRecipeView({ 
  currentFrame, 
  recipeData, 
  onFrameClick, 
  onVerbClick,
  onEditClick 
}: FrameRecipeViewProps) {
  const [expandedSections, setExpandedSections] = useState({
    roles: true,
    verbs: true,
    inheritance: true,
    uses: false,
    other: false,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Group roles by main/alt
  const groupedRoles = useMemo(() => {
    const roles = recipeData?.roles || currentFrame.roles?.map(r => ({
      id: r.id,
      role_type: {
        id: r.role_type_id,
        code: r.role_type_code,
        label: r.role_type_label,
        generic_description: '',
      },
      description: r.description,
      notes: r.notes,
      main: r.main,
      examples: r.examples,
      nickname: r.nickname,
      groups: [],
    })) || [];
    
    return {
      main: roles.filter(r => r.main),
      alt: roles.filter(r => !r.main),
    };
  }, [recipeData, currentFrame]);

  // Get inheritance chain
  const inheritanceChain = useMemo(() => {
    if (!recipeData) return { parents: [], children: [] };
    return {
      parents: recipeData.relations.inherits_from,
      children: recipeData.relations.inherited_by,
    };
  }, [recipeData]);

  return (
    <div className="w-full h-full flex gap-6 overflow-hidden">
      {/* Left Panel - Frame Details */}
      <div className="w-1/2 flex flex-col overflow-hidden">
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl shadow-lg p-6 overflow-auto">
          {/* Frame Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-white">{currentFrame.frame_name}</h2>
              {currentFrame.short_definition && (
                <p className="text-purple-200 mt-1">{currentFrame.short_definition}</p>
              )}
            </div>
            {onEditClick && (
              <button
                onClick={onEditClick}
                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm font-medium transition-colors"
              >
                ✏️ Edit
              </button>
            )}
          </div>

          {/* Prototypical Synset */}
          {currentFrame.prototypical_synset && (
            <div className="mb-4">
              <span className="px-3 py-1 bg-white/20 rounded-full text-white text-sm">
                📌 {currentFrame.prototypical_synset}
              </span>
            </div>
          )}

          {/* Definition */}
          {currentFrame.gloss && (
            <div className="mb-6 p-4 bg-white/10 rounded-lg">
              <p className="text-white/90 text-sm leading-relaxed">{currentFrame.gloss}</p>
            </div>
          )}

          {/* Roles Section */}
          <div className="mb-4">
            <button
              onClick={() => toggleSection('roles')}
              className="flex items-center gap-2 text-white font-semibold mb-3"
            >
              <span>{expandedSections.roles ? '▼' : '▶'}</span>
              Roles ({groupedRoles.main.length + groupedRoles.alt.length})
            </button>
            
            {expandedSections.roles && (
              <div className="space-y-2">
                {/* Main Roles */}
                {groupedRoles.main.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-purple-300 uppercase tracking-wide">Main Roles</div>
                    {groupedRoles.main.map(role => (
                      <div key={role.id} className="p-3 bg-blue-500/30 rounded-lg border border-blue-400/30">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{role.role_type.label}</span>
                          {role.nickname && (
                            <span className="text-xs text-purple-300">({role.nickname})</span>
                          )}
                        </div>
                        {role.description && (
                          <p className="text-sm text-white/80 mt-1">{role.description}</p>
                        )}
                        {role.notes && (
                          <p className="text-xs text-purple-300 mt-1 italic">{role.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Alt Roles */}
                {groupedRoles.alt.length > 0 && (
                  <div className="space-y-2 mt-3">
                    <div className="text-xs font-medium text-purple-300 uppercase tracking-wide">Alternative Roles</div>
                    {groupedRoles.alt.map(role => (
                      <div key={role.id} className="p-3 bg-white/10 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{role.role_type.label}</span>
                          {role.nickname && (
                            <span className="text-xs text-purple-300">({role.nickname})</span>
                          )}
                        </div>
                        {role.description && (
                          <p className="text-sm text-white/80 mt-1">{role.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {groupedRoles.main.length === 0 && groupedRoles.alt.length === 0 && (
                  <p className="text-purple-300 text-sm italic">No roles defined</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Recipe View */}
      <div className="w-1/2 flex flex-col overflow-hidden">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 overflow-auto flex-1">
          {/* Inheritance Section */}
          <div className="mb-6">
            <button
              onClick={() => toggleSection('inheritance')}
              className="flex items-center gap-2 text-gray-800 font-semibold mb-3"
            >
              <span>{expandedSections.inheritance ? '▼' : '▶'}</span>
              Frame Inheritance
            </button>
            
            {expandedSections.inheritance && (
              <div className="space-y-4">
                {/* Parent Frames */}
                {inheritanceChain.parents.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Inherits From
                    </div>
                    <div className="space-y-2">
                      {inheritanceChain.parents.map(parent => (
                        <div 
                          key={parent.id}
                          onClick={() => onFrameClick(parent.id)}
                          className="p-3 bg-green-50 border border-green-200 rounded-lg cursor-pointer hover:bg-green-100 transition-colors"
                        >
                          <div className="font-semibold text-green-800">{parent.frame_name}</div>
                          {parent.short_definition && (
                            <p className="text-sm text-green-700 mt-1">{parent.short_definition}</p>
                          )}
                          {parent.roles && parent.roles.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {parent.roles.slice(0, 5).map(role => (
                                <span 
                                  key={role.id}
                                  className={`text-xs px-2 py-0.5 rounded ${role.main ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-700'}`}
                                >
                                  {role.role_type_label}
                                </span>
                              ))}
                              {parent.roles.length > 5 && (
                                <span className="text-xs text-gray-500">+{parent.roles.length - 5}</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Child Frames */}
                {inheritanceChain.children.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Inherited By
                    </div>
                    <div className="space-y-2">
                      {inheritanceChain.children.map(child => (
                        <div 
                          key={child.id}
                          onClick={() => onFrameClick(child.id)}
                          className="p-3 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer hover:bg-amber-100 transition-colors"
                        >
                          <div className="font-semibold text-amber-800">{child.frame_name}</div>
                          {child.short_definition && (
                            <p className="text-sm text-amber-700 mt-1">{child.short_definition}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {inheritanceChain.parents.length === 0 && inheritanceChain.children.length === 0 && (
                  <p className="text-gray-500 text-sm italic">No frame inheritance relationships</p>
                )}
              </div>
            )}
          </div>

          {/* Verbs Section */}
          <div className="mb-6">
            <button
              onClick={() => toggleSection('verbs')}
              className="flex items-center gap-2 text-gray-800 font-semibold mb-3"
            >
              <span>{expandedSections.verbs ? '▼' : '▶'}</span>
              Verbs Using This Frame ({recipeData?.verbs.length || currentFrame.verbs?.length || 0})
            </button>
            
            {expandedSections.verbs && (
              <div className="space-y-2 max-h-80 overflow-auto">
                {(recipeData?.verbs || currentFrame.verbs?.map(v => ({
                  id: v.id,
                  code: v.code,
                  lemmas: v.lemmas,
                  gloss: v.gloss,
                  vendler_class: null,
                  roles: [],
                  role_groups: [],
                })) || []).map(verb => (
                  <div 
                    key={verb.id}
                    onClick={() => onVerbClick(verb.id)}
                    className="p-3 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-blue-800">{verb.code || verb.id}</span>
                      {verb.vendler_class && (
                        <span className={`text-xs px-2 py-0.5 rounded ${VENDLER_COLORS[verb.vendler_class].bg} ${VENDLER_COLORS[verb.vendler_class].text}`}>
                          {verb.vendler_class}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-blue-700 mt-1">
                      {verb.lemmas?.slice(0, 3).join(', ')}
                    </p>
                    {verb.gloss && (
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">{verb.gloss}</p>
                    )}
                    {verb.roles && verb.roles.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {verb.roles.slice(0, 5).map(role => (
                          <span 
                            key={role.id}
                            className={`text-xs px-2 py-0.5 rounded ${role.main ? 'bg-blue-200 text-blue-800' : 'bg-gray-200 text-gray-700'}`}
                          >
                            {role.role_type.label}
                          </span>
                        ))}
                        {verb.roles.length > 5 && (
                          <span className="text-xs text-gray-500">+{verb.roles.length - 5}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                
                {(recipeData?.verbs.length === 0 && (!currentFrame.verbs || currentFrame.verbs.length === 0)) && (
                  <p className="text-gray-500 text-sm italic">No verbs using this frame</p>
                )}
              </div>
            )}
          </div>

          {/* Uses/Used By Section */}
          {recipeData && (recipeData.relations.uses.length > 0 || recipeData.relations.used_by.length > 0) && (
            <div className="mb-6">
              <button
                onClick={() => toggleSection('uses')}
                className="flex items-center gap-2 text-gray-800 font-semibold mb-3"
              >
                <span>{expandedSections.uses ? '▼' : '▶'}</span>
                Uses Relations ({recipeData.relations.uses.length + recipeData.relations.used_by.length})
              </button>
              
              {expandedSections.uses && (
                <div className="space-y-4">
                  {recipeData.relations.uses.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Uses</div>
                      <div className="space-y-2">
                        {recipeData.relations.uses.map(frame => (
                          <div 
                            key={frame.id}
                            onClick={() => onFrameClick(frame.id)}
                            className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg cursor-pointer hover:bg-indigo-100 transition-colors"
                          >
                            <div className="font-semibold text-indigo-800">{frame.frame_name}</div>
                            {frame.short_definition && (
                              <p className="text-sm text-indigo-700 mt-1">{frame.short_definition}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {recipeData.relations.used_by.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Used By</div>
                      <div className="space-y-2">
                        {recipeData.relations.used_by.map(frame => (
                          <div 
                            key={frame.id}
                            onClick={() => onFrameClick(frame.id)}
                            className="p-3 bg-teal-50 border border-teal-200 rounded-lg cursor-pointer hover:bg-teal-100 transition-colors"
                          >
                            <div className="font-semibold text-teal-800">{frame.frame_name}</div>
                            {frame.short_definition && (
                              <p className="text-sm text-teal-700 mt-1">{frame.short_definition}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Other Relations Section */}
          {recipeData && recipeData.relations.other.length > 0 && (
            <div>
              <button
                onClick={() => toggleSection('other')}
                className="flex items-center gap-2 text-gray-800 font-semibold mb-3"
              >
                <span>{expandedSections.other ? '▼' : '▶'}</span>
                Other Relations ({recipeData.relations.other.length})
              </button>
              
              {expandedSections.other && (
                <div className="space-y-2">
                  {recipeData.relations.other.map((rel, idx) => (
                    <div 
                      key={idx}
                      onClick={() => onFrameClick(rel.frame.id)}
                      className="p-3 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {rel.direction === 'outgoing' ? '→' : '←'}
                        </span>
                        <span className="text-xs font-medium text-gray-600">
                          {RELATION_LABELS[rel.type] || rel.type}
                        </span>
                      </div>
                      <div className="font-semibold text-gray-800">{rel.frame.frame_name}</div>
                      {rel.frame.short_definition && (
                        <p className="text-sm text-gray-600 mt-1">{rel.frame.short_definition}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


