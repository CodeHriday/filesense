use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use parquet::file::properties::WriterProperties;
use parquet::arrow::ArrowWriter;
use arrow::array::{Array, StringArray, Int64Array, UInt8Array, TimestampMillisecondArray, ArrayRef};
use arrow::datatypes::{Schema, Field, DataType, TimeUnit};
use arrow::record_batch::RecordBatch;
use std::fs::File;

use crate::config::Config;
use crate::error::{LogServiceError, Result};
use crate::models::{LogEvent, SegmentInfo, StorageTier};

#[allow(dead_code)]
use crate::compression::CompressionEngine;

pub struct StorageManager {
    config: Config,
    compression: CompressionEngine,
    buffer: Arc<RwLock<Vec<LogEvent>>>,
    current_segment_id: Arc<RwLock<String>>,
}

impl StorageManager {
    pub async fn new(config: &Config) -> Result<Self> {
        let compression = CompressionEngine::new(config.compression_level, config.enable_dictionary);
        
        Ok(Self {
            config: config.clone(),
            compression,
            buffer: Arc::new(RwLock::new(Vec::with_capacity(config.max_buffer_size))),
            current_segment_id: Arc::new(RwLock::new(uuid::Uuid::new_v4().to_string())),
        })
    }

    pub fn log_schema() -> Schema {
        Schema::new(vec![
            Field::new("id", DataType::Utf8, false),
            Field::new("timestamp", DataType::Timestamp(TimeUnit::Millisecond, Some("UTC".into())), false),
            Field::new("level", DataType::UInt8, false),
            Field::new("source", DataType::Utf8, false),
            Field::new("message", DataType::Utf8, false),
            Field::new("job_id", DataType::Int64, true),
            Field::new("workflow_id", DataType::Int64, true),
            Field::new("mapping_id", DataType::Int64, true),
            Field::new("project_id", DataType::Int64, true),
            Field::new("user_id", DataType::Int64, true),
            Field::new("execution_id", DataType::Utf8, true),
            Field::new("step_name", DataType::Utf8, true),
            Field::new("duration_ms", DataType::Int64, true),
            Field::new("rows_processed", DataType::Int64, true),
            Field::new("error_code", DataType::Utf8, true),
            Field::new("stack_trace", DataType::Utf8, true),
            Field::new("metadata", DataType::Utf8, true),
        ])
    }

    pub async fn append(&self, event: LogEvent) -> Result<()> {
        let mut buffer = self.buffer.write().await;
        buffer.push(event);
        
        if buffer.len() >= self.config.max_buffer_size {
            drop(buffer);
            self.flush().await?;
        }
        
        Ok(())
    }

    pub async fn append_batch(&self, events: Vec<LogEvent>) -> Result<()> {
        let mut buffer = self.buffer.write().await;
        buffer.extend(events);
        
        if buffer.len() >= self.config.max_buffer_size {
            drop(buffer);
            self.flush().await?;
        }
        
        Ok(())
    }

    pub async fn flush(&self) -> Result<Option<SegmentInfo>> {
        let mut buffer = self.buffer.write().await;
        
        if buffer.is_empty() {
            return Ok(None);
        }
        
        let events: Vec<LogEvent> = buffer.drain(..).collect();
        drop(buffer);
        
        let segment_id = {
            let mut id = self.current_segment_id.write().await;
            let old_id = id.clone();
            *id = uuid::Uuid::new_v4().to_string();
            old_id
        };
        
        let segment_info = self.write_segment(&segment_id, events).await?;
        
        Ok(Some(segment_info))
    }

    async fn write_segment(&self, segment_id: &str, events: Vec<LogEvent>) -> Result<SegmentInfo> {
        let schema = Arc::new(Self::log_schema());
        
        let ids: Vec<&str> = events.iter().map(|e| e.id.as_str()).collect();
        let timestamps: Vec<i64> = events.iter().map(|e| e.timestamp.timestamp_millis()).collect();
        let levels: Vec<u8> = events.iter().map(|e| e.level.as_u8()).collect();
        let sources: Vec<String> = events.iter().map(|e| e.source.to_string()).collect();
        let messages: Vec<&str> = events.iter().map(|e| e.message.as_str()).collect();
        let job_ids: Vec<Option<i64>> = events.iter().map(|e| e.job_id).collect();
        let workflow_ids: Vec<Option<i64>> = events.iter().map(|e| e.workflow_id).collect();
        let mapping_ids: Vec<Option<i64>> = events.iter().map(|e| e.mapping_id).collect();
        let project_ids: Vec<Option<i64>> = events.iter().map(|e| e.project_id).collect();
        let user_ids: Vec<Option<i64>> = events.iter().map(|e| e.user_id).collect();
        let execution_ids: Vec<Option<&str>> = events.iter().map(|e| e.execution_id.as_deref()).collect();
        let step_names: Vec<Option<&str>> = events.iter().map(|e| e.step_name.as_deref()).collect();
        let duration_ms: Vec<Option<i64>> = events.iter().map(|e| e.duration_ms).collect();
        let rows_processed: Vec<Option<i64>> = events.iter().map(|e| e.rows_processed).collect();
        let error_codes: Vec<Option<&str>> = events.iter().map(|e| e.error_code.as_deref()).collect();
        let stack_traces: Vec<Option<&str>> = events.iter().map(|e| e.stack_trace.as_deref()).collect();
        let metadata: Vec<String> = events.iter().map(|e| e.metadata.to_string()).collect();

        let batch = RecordBatch::try_new(
            schema.clone(),
            vec![
                Arc::new(StringArray::from(ids)) as ArrayRef,
                Arc::new(TimestampMillisecondArray::from(timestamps).with_timezone("UTC")) as ArrayRef,
                Arc::new(UInt8Array::from(levels)) as ArrayRef,
                Arc::new(StringArray::from(sources.iter().map(|s| s.as_str()).collect::<Vec<_>>())) as ArrayRef,
                Arc::new(StringArray::from(messages)) as ArrayRef,
                Arc::new(Int64Array::from(job_ids)) as ArrayRef,
                Arc::new(Int64Array::from(workflow_ids)) as ArrayRef,
                Arc::new(Int64Array::from(mapping_ids)) as ArrayRef,
                Arc::new(Int64Array::from(project_ids)) as ArrayRef,
                Arc::new(Int64Array::from(user_ids)) as ArrayRef,
                Arc::new(StringArray::from(execution_ids)) as ArrayRef,
                Arc::new(StringArray::from(step_names)) as ArrayRef,
                Arc::new(Int64Array::from(duration_ms)) as ArrayRef,
                Arc::new(Int64Array::from(rows_processed)) as ArrayRef,
                Arc::new(StringArray::from(error_codes)) as ArrayRef,
                Arc::new(StringArray::from(stack_traces)) as ArrayRef,
                Arc::new(StringArray::from(metadata.iter().map(|s| s.as_str()).collect::<Vec<_>>())) as ArrayRef,
            ],
        ).map_err(|e| LogServiceError::Storage(e.to_string()))?;

        let file_path = self.config.data_dir.join(format!("{}.parquet", segment_id));
        let file = File::create(&file_path)?;

        let props = WriterProperties::builder()
            .set_compression(parquet::basic::Compression::ZSTD(
                parquet::basic::ZstdLevel::try_new(self.config.compression_level)?
            ))
            .set_dictionary_enabled(self.config.enable_dictionary)
            .set_statistics_enabled(parquet::file::properties::EnabledStatistics::Page)
            .build();

        let mut writer = ArrowWriter::try_new(file, schema, Some(props))?;
        writer.write(&batch)?;
        writer.close()?;

        let file_metadata = std::fs::metadata(&file_path)?;
        let compressed_size = file_metadata.len();
        
        let uncompressed_size: u64 = events.iter()
            .map(|e| e.message.len() as u64 + 200)
            .sum();

        let start_time = events.first().map(|e| e.timestamp).unwrap_or_else(chrono::Utc::now);
        let end_time = events.last().map(|e| e.timestamp).unwrap_or_else(chrono::Utc::now);

        Ok(SegmentInfo {
            id: segment_id.to_string(),
            start_time,
            end_time,
            log_count: events.len(),
            size_bytes: uncompressed_size,
            compressed_size_bytes: compressed_size,
            compression_ratio: uncompressed_size as f64 / compressed_size as f64,
            tier: StorageTier::Hot,
            indexed: false,
        })
    }

    pub async fn read_segment(&self, segment_id: &str) -> Result<Vec<LogEvent>> {
        let file_path = self.config.data_dir.join(format!("{}.parquet", segment_id));
        
        if !file_path.exists() {
            let warm_path = self.config.archive_dir.join("warm").join(format!("{}.parquet", segment_id));
            let cold_path = self.config.archive_dir.join("cold").join(format!("{}.parquet", segment_id));
            
            if warm_path.exists() {
                return self.read_parquet_file(&warm_path).await;
            } else if cold_path.exists() {
                return self.read_parquet_file(&cold_path).await;
            }
            
            return Err(LogServiceError::NotFound(format!("Segment {} not found", segment_id)));
        }
        
        self.read_parquet_file(&file_path).await
    }

    async fn read_parquet_file(&self, path: &PathBuf) -> Result<Vec<LogEvent>> {
        use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
        
        let file = File::open(path)?;
        let builder = ParquetRecordBatchReaderBuilder::try_new(file)?;
        let reader = builder.build()?;
        
        let mut events = Vec::new();
        
        for batch_result in reader {
            let batch = batch_result?;
            let num_rows = batch.num_rows();
            
            let ids = batch.column(0).as_any().downcast_ref::<StringArray>().unwrap();
            let timestamps = batch.column(1).as_any().downcast_ref::<TimestampMillisecondArray>().unwrap();
            let levels = batch.column(2).as_any().downcast_ref::<UInt8Array>().unwrap();
            let sources = batch.column(3).as_any().downcast_ref::<StringArray>().unwrap();
            let messages = batch.column(4).as_any().downcast_ref::<StringArray>().unwrap();
            let job_ids = batch.column(5).as_any().downcast_ref::<Int64Array>().unwrap();
            let workflow_ids = batch.column(6).as_any().downcast_ref::<Int64Array>().unwrap();
            let mapping_ids = batch.column(7).as_any().downcast_ref::<Int64Array>().unwrap();
            let project_ids = batch.column(8).as_any().downcast_ref::<Int64Array>().unwrap();
            let user_ids = batch.column(9).as_any().downcast_ref::<Int64Array>().unwrap();
            let execution_ids = batch.column(10).as_any().downcast_ref::<StringArray>().unwrap();
            let step_names = batch.column(11).as_any().downcast_ref::<StringArray>().unwrap();
            let duration_ms_arr = batch.column(12).as_any().downcast_ref::<Int64Array>().unwrap();
            let rows_processed_arr = batch.column(13).as_any().downcast_ref::<Int64Array>().unwrap();
            let error_codes = batch.column(14).as_any().downcast_ref::<StringArray>().unwrap();
            let stack_traces = batch.column(15).as_any().downcast_ref::<StringArray>().unwrap();
            let metadata_arr = batch.column(16).as_any().downcast_ref::<StringArray>().unwrap();
            
            for i in 0..num_rows {
                let event = LogEvent {
                    id: ids.value(i).to_string(),
                    timestamp: chrono::DateTime::from_timestamp_millis(timestamps.value(i))
                        .unwrap_or_else(chrono::Utc::now)
                        .with_timezone(&chrono::Utc),
                    level: crate::models::LogLevel::from_u8(levels.value(i)),
                    source: parse_source(sources.value(i)),
                    message: messages.value(i).to_string(),
                    job_id: if job_ids.is_null(i) { None } else { Some(job_ids.value(i)) },
                    workflow_id: if workflow_ids.is_null(i) { None } else { Some(workflow_ids.value(i)) },
                    mapping_id: if mapping_ids.is_null(i) { None } else { Some(mapping_ids.value(i)) },
                    project_id: if project_ids.is_null(i) { None } else { Some(project_ids.value(i)) },
                    user_id: if user_ids.is_null(i) { None } else { Some(user_ids.value(i)) },
                    execution_id: if execution_ids.is_null(i) { None } else { Some(execution_ids.value(i).to_string()) },
                    step_name: if step_names.is_null(i) { None } else { Some(step_names.value(i).to_string()) },
                    duration_ms: if duration_ms_arr.is_null(i) { None } else { Some(duration_ms_arr.value(i)) },
                    rows_processed: if rows_processed_arr.is_null(i) { None } else { Some(rows_processed_arr.value(i)) },
                    error_code: if error_codes.is_null(i) { None } else { Some(error_codes.value(i).to_string()) },
                    stack_trace: if stack_traces.is_null(i) { None } else { Some(stack_traces.value(i).to_string()) },
                    metadata: if metadata_arr.is_null(i) { 
                        serde_json::Value::Null 
                    } else { 
                        serde_json::from_str(metadata_arr.value(i)).unwrap_or(serde_json::Value::Null)
                    },
                };
                events.push(event);
            }
        }
        
        Ok(events)
    }

    pub async fn buffer_count(&self) -> usize {
        self.buffer.read().await.len()
    }

    pub async fn list_segments(&self) -> Result<Vec<String>> {
        let mut segments = Vec::new();
        
        for entry in std::fs::read_dir(&self.config.data_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "parquet") {
                if let Some(stem) = path.file_stem() {
                    segments.push(stem.to_string_lossy().to_string());
                }
            }
        }
        
        Ok(segments)
    }
}

fn parse_source(s: &str) -> crate::models::LogSource {
    match s {
        "job_execution" => crate::models::LogSource::JobExecution,
        "workflow_execution" => crate::models::LogSource::WorkflowExecution,
        "transformation" => crate::models::LogSource::Transformation,
        "scheduler" => crate::models::LogSource::Scheduler,
        "monitor" => crate::models::LogSource::Monitor,
        "system" => crate::models::LogSource::System,
        "api" => crate::models::LogSource::Api,
        _ => crate::models::LogSource::Custom,
    }
}
