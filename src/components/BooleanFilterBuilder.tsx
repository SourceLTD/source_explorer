"use client";

import React from 'react';
import type { BooleanFilterGroup, BooleanFilterNode, BooleanFilterRule } from '@/lib/filters/types';
import { createEmptyGroup } from '@/lib/filters/types';
import { getFieldConfigsForPos } from '@/lib/filters/config';

type Pos = 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames' | 'lexical_units';

interface BooleanFilterBuilderProps {
  pos: Pos;
  value: BooleanFilterGroup;
  onChange: (next: BooleanFilterGroup) => void;
  className?: string;
}

export default function BooleanFilterBuilder({ pos, value, onChange, className }: BooleanFilterBuilderProps) {
  const fields = React.useMemo(() => getFieldConfigsForPos(pos), [pos]);

  const updateNode = (updater: (node: BooleanFilterGroup) => void) => {
    const copy = deepCloneGroup(value);
    updater(copy);
    onChange(copy);
  };

  const addRule = () =>
    updateNode(group => {
      const field = fields[0];
      group.children.push({ kind: 'rule', field: field.key, operator: field.operators[0]?.key ?? 'equals', value: defaultValueFor(field.operators[0]?.key ?? 'equals') });
    });

  const addGroup = () =>
    updateNode(group => {
      group.children.push(createEmptyGroup());
    });

  return (
    <div className={`rounded-xl border border-gray-200 bg-white ${className ?? ''}`}>
      <GroupEditor pos={pos} node={value} fields={fields} onChange={onChange} />
      <div className="flex gap-2 border-t border-gray-200 p-2">
        <button onClick={addRule} className="cursor-pointer rounded-xl border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100" type="button">+ Add Rule</button>
        <button onClick={addGroup} className="cursor-pointer rounded-xl border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100" type="button">+ Add Group</button>
      </div>
    </div>
  );
}

function GroupEditor({ pos, node, fields, onChange }: { pos: Pos; node: BooleanFilterGroup; fields: ReturnType<typeof getFieldConfigsForPos>; onChange: (next: BooleanFilterGroup) => void }) {
  const setOp = (op: 'and' | 'or') => onChange({ ...node, op });

  const updateChild = (index: number, child: BooleanFilterNode) => {
    const copy: BooleanFilterGroup = { ...node, children: node.children.slice() };
    copy.children[index] = child;
    onChange(copy);
  };

  const removeChild = (index: number) => {
    const copy: BooleanFilterGroup = { ...node, children: node.children.filter((_, i) => i !== index) };
    onChange(copy);
  };

  return (
    <div className="p-2">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs text-gray-600">Group operator</span>
        <select value={node.op} onChange={e => setOp(e.target.value as 'and' | 'or')} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-800">
          <option value="and">AND</option>
          <option value="or">OR</option>
        </select>
      </div>
      <ul className="space-y-2">
        {node.children.map((child, index) => (
          <li key={index} className="rounded border border-gray-200 p-2">
            {child.kind === 'group' ? (
              <GroupEditor pos={pos} node={child} fields={fields} onChange={next => updateChild(index, next)} />
            ) : (
              <RuleEditor rule={child} fields={fields} onChange={next => updateChild(index, next)} />
            )}
            <div className="mt-1 flex justify-end">
              <button onClick={() => removeChild(index)} className="cursor-pointer rounded-xl border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100" type="button">
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RuleEditor({ rule, fields, onChange }: { rule: BooleanFilterRule; fields: ReturnType<typeof getFieldConfigsForPos>; onChange: (next: BooleanFilterRule) => void }) {
  const field = fields.find(f => f.key === rule.field) ?? fields[0];

  const setField = (key: string) => {
    const f = fields.find(x => x.key === key) ?? fields[0];
    const op = f.operators[0]?.key ?? 'equals';
    onChange({ ...rule, field: f.key, operator: op, value: defaultValueFor(op), value2: undefined });
  };

  const setOperator = (op: string) => {
    onChange({ ...rule, operator: op, value: defaultValueFor(op), value2: undefined });
  };

  const setValue = (v: unknown) => onChange({ ...rule, value: v });
  const setValue2 = (v: unknown) => onChange({ ...rule, value2: v });

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
      <select value={rule.field} onChange={e => setField(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-800">
        {fields.map(f => (
          <option key={f.key} value={f.key}>{f.label}</option>
        ))}
      </select>
      <select value={rule.operator} onChange={e => setOperator(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-800">
        {field.operators.map(op => (
          <option key={op.key} value={op.key}>{op.label}</option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <ValueInput fieldType={field.type} operator={rule.operator} value={rule.value} onChange={setValue} />
        {requiresSecondValue(rule.operator) && (
          <ValueInput fieldType={field.type} operator={rule.operator} value={rule.value2} onChange={setValue2} />
        )}
      </div>
    </div>
  );
}

function ValueInput({ fieldType, operator, value, onChange }: { fieldType: string; operator: string; value: unknown; onChange: (v: unknown) => void }) {
  if (fieldType === 'boolean') {
    const val = Boolean(value);
    return (
      <select value={val ? 'true' : 'false'} onChange={e => onChange(e.target.value === 'true')} className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800">
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (fieldType === 'number' || fieldType === 'computed_number') {
    return (
      <input type="number" value={value === undefined ? '' : String(value)} onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))} className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800" />
    );
  }

  if (fieldType === 'date') {
    return (
      <input type="date" value={value ? String(value) : ''} onChange={e => onChange(e.target.value || undefined)} className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800" />
    );
  }

  // string, enum, array, frame → text input
  const placeholder = operator === 'hasSome' || operator === 'hasEvery' || operator === 'in' || operator === 'not_in' ? 'comma separated' : '';
  return (
    <input
      type="text"
      value={value === undefined ? '' : String(value)}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800"
    />
  );
}

function requiresSecondValue(op: string) {
  return op === 'between';
}

function defaultValueFor(op: string): unknown {
  if (op === 'between') return '';
  if (op === 'is') return false;
  return '';
}

function deepCloneGroup(group: BooleanFilterGroup): BooleanFilterGroup {
  return JSON.parse(JSON.stringify(group)) as BooleanFilterGroup;
}


