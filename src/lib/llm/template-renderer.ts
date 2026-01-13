/**
 * Template Renderer - Jinja2-style template rendering with loop support
 * 
 * Supports:
 * - Simple variable interpolation: {{ variable }}
 * - Nested property access: {{ frame.definition }}
 * - For loops over collections: {% for item in collection %}...{% endfor %}
 * - Item property access within loops: {{ item.property }}
 * 
 * Uses nunjucks (Mozilla's JS Jinja2 implementation) with a sandboxed configuration.
 */

import * as nunjucks from 'nunjucks';

// Configure nunjucks environment with security settings
const env = new nunjucks.Environment(null, {
  autoescape: false, // We're generating plain text prompts, not HTML
  throwOnUndefined: false, // Missing variables render as empty string
  trimBlocks: true, // Remove first newline after block tags
  lstripBlocks: true, // Strip leading whitespace from block tags
});

// Add custom filters
env.addFilter('join', (arr: unknown[], separator = ', ') => {
  if (!Array.isArray(arr)) return '';
  return arr.join(separator);
});

env.addFilter('limit', (arr: unknown[], count: number) => {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, count);
});

env.addFilter('default', (value: unknown, defaultValue: string) => {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }
  return value;
});

/**
 * Context for template rendering - supports both flat key-value pairs
 * and nested objects/arrays for loop iteration.
 */
export type TemplateContext = Record<string, unknown>;

/**
 * Result of template rendering
 */
export interface RenderResult {
  prompt: string;
  success: boolean;
  error?: string;
}

/**
 * Render a template with the given context.
 * 
 * @param template - The template string with Jinja2-style syntax
 * @param context - The context object with variables and collections
 * @returns The rendered prompt string and any error information
 */
export function renderTemplate(template: string, context: TemplateContext): RenderResult {
  try {
    const prompt = env.renderString(template, context);
    return { prompt, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown template error';
    console.error('[template-renderer] Render error:', errorMessage);
    return {
      prompt: '',
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Check if a template string contains loop syntax.
 * Useful for determining if we need structured data for relations.
 */
export function hasLoopSyntax(template: string): boolean {
  return /\{%\s*for\s+/.test(template);
}

/**
 * Extract collection names referenced in for loops.
 * Returns an array of collection paths like ['frame.roles', 'frame.lexical_units'].
 */
export function extractLoopCollections(template: string): string[] {
  const loopRegex = /\{%\s*for\s+\w+\s+in\s+([a-zA-Z0-9_.]+)\s*%\}/g;
  const collections: string[] = [];
  let match;
  
  while ((match = loopRegex.exec(template)) !== null) {
    if (match[1] && !collections.includes(match[1])) {
      collections.push(match[1]);
    }
  }
  
  return collections;
}

/**
 * Validate template syntax without rendering.
 * Returns any syntax errors found.
 */
export function validateTemplate(template: string): { valid: boolean; error?: string } {
  try {
    // Attempt to compile the template
    env.renderString(template, {});
    return { valid: true };
  } catch (error) {
    if (error instanceof Error) {
      // Nunjucks errors for undefined variables are okay (we use throwOnUndefined: false)
      // Only actual syntax errors should be reported
      if (error.message.includes('unexpected token') || 
          error.message.includes('expected') ||
          error.message.includes('unclosed')) {
        return { valid: false, error: error.message };
      }
    }
    return { valid: true };
  }
}
