use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
    Fatal,
}

impl LogLevel {
    pub fn as_u8(&self) -> u8 {
        match self {
            LogLevel::Trace => 0,
            LogLevel::Debug => 1,
            LogLevel::Info => 2,
            LogLevel::Warn => 3,
            LogLevel::Error => 4,
            LogLevel::Fatal => 5,
        }
    }
    
    pub fn from_u8(v: u8) -> Self {
        match v {
            0 => LogLevel::Trace,
            1 => LogLevel::Debug,
            2 => LogLevel::Info,
            3 => LogLevel::Warn,
            4 => LogLevel::Error,
            5 => LogLevel::Fatal,
            _ => LogLevel::Info,
        }
    }
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LogLevel::Trace => write!(f, "trace"),
            LogLevel::Debug => write!(f, "debug"),
            LogLevel::Info => write!(f, "info"),
            LogLevel::Warn => write!(f, "warn"),
            LogLevel::Error => write!(f, "error"),
            LogLevel::Fatal => write!(f, "fatal"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogSource {
    JobExecution,
    WorkflowExecution,
    Transformation,
    Scheduler,
    Monitor,
    System,
    Api,
    Custom,
}

impl std::fmt::Display for LogSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LogSource::JobExecution => write!(f, "job_execution"),
            LogSource::WorkflowExecution => write!(f, "workflow_execution"),
            LogSource::Transformation => write!(f, "transformation"),
            LogSource::Scheduler => write!(f, "scheduler"),
            LogSource::Monitor => write!(f, "monitor"),
            LogSource::System => write!(f, "system"),
            LogSource::Api => write!(f, "api"),
            LogSource::Custom => write!(f, "custom"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEvent {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub level: LogLevel,
    pub source: LogSource,
    pub message: String,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub job_id: Option<i64>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workflow_id: Option<i64>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mapping_id: Option<i64>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<i64>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<i64>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_id: Option<String>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step_name: Option<String>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rows_processed: Option<i64>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stack_trace: Option<String>,
    
    #[serde(default)]
    pub metadata: serde_json::Value,
}

impl LogEvent {
    pub fn new(level: LogLevel, source: LogSource, message: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            level,
            source,
            message: message.into(),
            job_id: None,
            workflow_id: None,
            mapping_id: None,
            project_id: None,
            user_id: None,
            execution_id: None,
            step_name: None,
            duration_ms: None,
            rows_processed: None,
            error_code: None,
            stack_trace: None,
            metadata: serde_json::Value::Null,
        }
    }
    
    pub fn with_job_id(mut self, job_id: i64) -> Self {
        self.job_id = Some(job_id);
        self
    }
    
    pub fn with_workflow_id(mut self, workflow_id: i64) -> Self {
        self.workflow_id = Some(workflow_id);
        self
    }
    
    pub fn with_execution_id(mut self, execution_id: impl Into<String>) -> Self {
        self.execution_id = Some(execution_id.into());
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogBatch {
    pub logs: Vec<LogEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogQuery {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_time: Option<DateTime<Utc>>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_time: Option<DateTime<Utc>>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub levels: Option<Vec<LogLevel>>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sources: Option<Vec<LogSource>>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub job_id: Option<i64>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workflow_id: Option<i64>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mapping_id: Option<i64>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<i64>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_id: Option<String>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_text: Option<String>,
    
    #[serde(default = "default_limit")]
    pub limit: usize,
    
    #[serde(default)]
    pub offset: usize,
    
    #[serde(default)]
    pub sort_desc: bool,
}

fn default_limit() -> usize {
    100
}

impl Default for LogQuery {
    fn default() -> Self {
        Self {
            start_time: None,
            end_time: None,
            levels: None,
            sources: None,
            job_id: None,
            workflow_id: None,
            mapping_id: None,
            project_id: None,
            execution_id: None,
            search_text: None,
            limit: 100,
            offset: 0,
            sort_desc: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogQueryResult {
    pub logs: Vec<LogEvent>,
    pub total: usize,
    pub has_more: bool,
    pub query_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SegmentInfo {
    pub id: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub log_count: usize,
    pub size_bytes: u64,
    pub compressed_size_bytes: u64,
    pub compression_ratio: f64,
    pub tier: StorageTier,
    pub indexed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StorageTier {
    Hot,
    Warm,
    Cold,
    Archive,
}

impl std::fmt::Display for StorageTier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StorageTier::Hot => write!(f, "hot"),
            StorageTier::Warm => write!(f, "warm"),
            StorageTier::Cold => write!(f, "cold"),
            StorageTier::Archive => write!(f, "archive"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceStats {
    pub total_logs: u64,
    pub total_segments: usize,
    pub total_size_bytes: u64,
    pub compressed_size_bytes: u64,
    pub overall_compression_ratio: f64,
    pub logs_per_second: f64,
    pub segments_by_tier: std::collections::HashMap<String, usize>,
    pub uptime_secs: u64,
}
