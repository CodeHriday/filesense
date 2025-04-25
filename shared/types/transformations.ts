/**
 * Transformation Types
 * 
 * This file defines TypeScript interfaces for data transformation operations.
 */

/**
 * Base transformation interface
 */
export interface Transformation {
  id: string;
  name: string;
  description?: string;
  source_file_id?: string;
  target_file_id?: string;
  transform_type: TransformationType;
  transform_config: TransformConfig;
  status: TransformationStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Transform types
 */
export enum TransformationType {
  JOIN = 'join',
  FILTER = 'filter',
  AGGREGATE = 'aggregate',
  TRANSFORM = 'transform',
  MAP = 'map',
  CLEANSE = 'cleanse',
  ENRICH = 'enrich',
  LOOKUP = 'lookup',
  CUSTOM = 'custom'
}

/**
 * Transform status
 */
export enum TransformationStatus {
  CREATED = 'created',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SCHEDULED = 'scheduled'
}

/**
 * Base transformation configuration
 */
export interface TransformConfig {
  sourceColumns?: string[];
  targetColumns?: string[];
  [key: string]: any;
}

/**
 * Join transformation configuration
 */
export interface JoinTransformConfig extends TransformConfig {
  joinType: 'inner' | 'left' | 'right' | 'full';
  sourceKey: string;
  targetKey: string;
  secondaryFileId: string;
}

/**
 * Filter transformation configuration
 */
export interface FilterTransformConfig extends TransformConfig {
  filterConditions: FilterCondition[];
  operator: 'AND' | 'OR';
}

/**
 * Filter condition
 */
export interface FilterCondition {
  column: string;
  operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'LIKE' | 'IN' | 'NOT IN' | 'IS NULL' | 'IS NOT NULL';
  value?: any;
}

/**
 * Aggregate transformation configuration
 */
export interface AggregateTransformConfig extends TransformConfig {
  groupByColumns: string[];
  aggregations: Aggregation[];
}

/**
 * Aggregation definition
 */
export interface Aggregation {
  column: string;
  operation: 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT' | 'COUNT_DISTINCT';
  alias: string;
}

/**
 * Column mapping transformation
 */
export interface MapTransformConfig extends TransformConfig {
  columnMappings: ColumnMapping[];
}

/**
 * Column mapping definition
 */
export interface ColumnMapping {
  sourceColumn: string;
  targetColumn: string;
  transformation?: string;
}

/**
 * Data cleansing transformation
 */
export interface CleanseTransformConfig extends TransformConfig {
  rules: CleansingRule[];
}

/**
 * Data cleansing rule
 */
export interface CleansingRule {
  column: string;
  actions: ('TRIM' | 'UPPERCASE' | 'LOWERCASE' | 'REMOVE_SPECIAL_CHARS' | 'FILL_NULL' | 'CUSTOM')[];
  customAction?: string;
  parameters?: Record<string, any>;
}

/**
 * Data lookup transformation
 */
export interface LookupTransformConfig extends TransformConfig {
  lookupTable: string;
  lookupKey: string;
  sourceKey: string;
  fieldsToInclude: string[];
}

/**
 * New transformation request
 */
export interface CreateTransformationRequest {
  name: string;
  description?: string;
  source_file_id?: string;
  target_file_id?: string;
  transform_type: TransformationType;
  transform_config: TransformConfig;
}

/**
 * Update transformation request
 */
export interface UpdateTransformationRequest {
  name?: string;
  description?: string;
  source_file_id?: string;
  target_file_id?: string;
  transform_type?: TransformationType;
  transform_config?: TransformConfig;
  status?: TransformationStatus;
}