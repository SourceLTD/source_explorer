/**
 * Database Module Index
 * 
 * Exports the new unified entity functions.
 * The original db.ts functions are still available via '@/lib/db' for backwards compatibility.
 */

// Export entity configuration
export * from './config';

// Export unified entity functions
export { getPaginatedEntities } from './entities';
