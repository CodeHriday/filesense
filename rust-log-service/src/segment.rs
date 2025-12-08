use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::{DateTime, Utc};
use sled::Db;

use crate::config::Config;
use crate::error::{LogServiceError, Result};
use crate::models::{SegmentInfo, StorageTier};

#[derive(Debug, Clone)]
pub struct SegmentMetadata {
    pub id: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub log_count: usize,
    pub size_bytes: u64,
    pub compressed_size_bytes: u64,
    pub tier: StorageTier,
    pub indexed: bool,
    pub path: PathBuf,
    pub created_at: DateTime<Utc>,
    pub last_accessed: DateTime<Utc>,
}

impl SegmentMetadata {
    pub fn to_segment_info(&self) -> SegmentInfo {
        SegmentInfo {
            id: self.id.clone(),
            start_time: self.start_time,
            end_time: self.end_time,
            log_count: self.log_count,
            size_bytes: self.size_bytes,
            compressed_size_bytes: self.compressed_size_bytes,
            compression_ratio: if self.compressed_size_bytes > 0 {
                self.size_bytes as f64 / self.compressed_size_bytes as f64
            } else {
                0.0
            },
            tier: self.tier,
            indexed: self.indexed,
        }
    }
}

pub struct SegmentManager {
    #[allow(dead_code)]
    config: Config,
    db: Db,
    segments: Arc<RwLock<HashMap<String, SegmentMetadata>>>,
    time_index: Arc<RwLock<Vec<(DateTime<Utc>, String)>>>,
}

impl SegmentManager {
    pub async fn new(config: &Config) -> Result<Self> {
        let db_path = config.data_dir.join("segment_metadata");
        let db = sled::open(&db_path)
            .map_err(|e| LogServiceError::Storage(format!("Failed to open segment metadata db: {}", e)))?;
        
        let mut segments = HashMap::new();
        let mut time_index = Vec::new();
        
        for result in db.iter() {
            if let Ok((key, value)) = result {
                let key_str = String::from_utf8_lossy(&key).to_string();
                if let Ok(metadata) = serde_json::from_slice::<SegmentMetadata>(&value) {
                    time_index.push((metadata.start_time, key_str.clone()));
                    segments.insert(key_str, metadata);
                }
            }
        }
        
        time_index.sort_by(|a, b| a.0.cmp(&b.0));
        
        Ok(Self {
            config: config.clone(),
            db,
            segments: Arc::new(RwLock::new(segments)),
            time_index: Arc::new(RwLock::new(time_index)),
        })
    }

    pub async fn register_segment(&self, info: SegmentInfo, path: PathBuf) -> Result<()> {
        let now = Utc::now();
        let metadata = SegmentMetadata {
            id: info.id.clone(),
            start_time: info.start_time,
            end_time: info.end_time,
            log_count: info.log_count,
            size_bytes: info.size_bytes,
            compressed_size_bytes: info.compressed_size_bytes,
            tier: info.tier,
            indexed: info.indexed,
            path,
            created_at: now,
            last_accessed: now,
        };
        
        let serialized = serde_json::to_vec(&metadata)
            .map_err(|e| LogServiceError::Storage(e.to_string()))?;
        
        self.db.insert(info.id.as_bytes(), serialized)
            .map_err(|e| LogServiceError::Storage(e.to_string()))?;
        
        self.db.flush()
            .map_err(|e| LogServiceError::Storage(e.to_string()))?;
        
        let mut segments = self.segments.write().await;
        segments.insert(info.id.clone(), metadata.clone());
        
        let mut time_index = self.time_index.write().await;
        time_index.push((info.start_time, info.id));
        time_index.sort_by(|a, b| a.0.cmp(&b.0));
        
        Ok(())
    }

    pub async fn get_segment(&self, id: &str) -> Result<Option<SegmentMetadata>> {
        let segments = self.segments.read().await;
        Ok(segments.get(id).cloned())
    }

    pub async fn find_segments_in_range(
        &self,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<SegmentMetadata>> {
        let segments = self.segments.read().await;
        let time_index = self.time_index.read().await;
        
        let start_idx = time_index.partition_point(|(t, _)| *t < start);
        
        let mut result = Vec::new();
        for i in start_idx..time_index.len() {
            let (segment_start, segment_id) = &time_index[i];
            if *segment_start > end {
                break;
            }
            
            if let Some(metadata) = segments.get(segment_id) {
                if metadata.end_time >= start && metadata.start_time <= end {
                    result.push(metadata.clone());
                }
            }
        }
        
        Ok(result)
    }

    pub async fn get_segments_by_tier(&self, tier: StorageTier) -> Result<Vec<SegmentMetadata>> {
        let segments = self.segments.read().await;
        Ok(segments.values()
            .filter(|s| s.tier == tier)
            .cloned()
            .collect())
    }

    pub async fn update_tier(&self, id: &str, new_tier: StorageTier, new_path: PathBuf) -> Result<()> {
        let mut segments = self.segments.write().await;
        
        if let Some(metadata) = segments.get_mut(id) {
            metadata.tier = new_tier;
            metadata.path = new_path;
            
            let serialized = serde_json::to_vec(&metadata)
                .map_err(|e| LogServiceError::Storage(e.to_string()))?;
            
            self.db.insert(id.as_bytes(), serialized)
                .map_err(|e| LogServiceError::Storage(e.to_string()))?;
        }
        
        Ok(())
    }

    pub async fn mark_indexed(&self, id: &str) -> Result<()> {
        let mut segments = self.segments.write().await;
        
        if let Some(metadata) = segments.get_mut(id) {
            metadata.indexed = true;
            
            let serialized = serde_json::to_vec(&metadata)
                .map_err(|e| LogServiceError::Storage(e.to_string()))?;
            
            self.db.insert(id.as_bytes(), serialized)
                .map_err(|e| LogServiceError::Storage(e.to_string()))?;
        }
        
        Ok(())
    }

    pub async fn remove_segment(&self, id: &str) -> Result<()> {
        self.db.remove(id.as_bytes())
            .map_err(|e| LogServiceError::Storage(e.to_string()))?;
        
        let mut segments = self.segments.write().await;
        segments.remove(id);
        
        let mut time_index = self.time_index.write().await;
        time_index.retain(|(_, sid)| sid != id);
        
        Ok(())
    }

    pub async fn list_all(&self) -> Result<Vec<SegmentInfo>> {
        let segments = self.segments.read().await;
        Ok(segments.values().map(|m| m.to_segment_info()).collect())
    }

    pub async fn total_stats(&self) -> Result<(u64, u64, usize)> {
        let segments = self.segments.read().await;
        let total_size: u64 = segments.values().map(|s| s.size_bytes).sum();
        let compressed_size: u64 = segments.values().map(|s| s.compressed_size_bytes).sum();
        let total_logs: usize = segments.values().map(|s| s.log_count).sum();
        Ok((total_size, compressed_size, total_logs))
    }
}

impl serde::Serialize for SegmentMetadata {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("SegmentMetadata", 11)?;
        state.serialize_field("id", &self.id)?;
        state.serialize_field("start_time", &self.start_time)?;
        state.serialize_field("end_time", &self.end_time)?;
        state.serialize_field("log_count", &self.log_count)?;
        state.serialize_field("size_bytes", &self.size_bytes)?;
        state.serialize_field("compressed_size_bytes", &self.compressed_size_bytes)?;
        state.serialize_field("tier", &self.tier)?;
        state.serialize_field("indexed", &self.indexed)?;
        state.serialize_field("path", &self.path.to_string_lossy())?;
        state.serialize_field("created_at", &self.created_at)?;
        state.serialize_field("last_accessed", &self.last_accessed)?;
        state.end()
    }
}

impl<'de> serde::Deserialize<'de> for SegmentMetadata {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(serde::Deserialize)]
        struct Helper {
            id: String,
            start_time: DateTime<Utc>,
            end_time: DateTime<Utc>,
            log_count: usize,
            size_bytes: u64,
            compressed_size_bytes: u64,
            tier: StorageTier,
            indexed: bool,
            path: String,
            created_at: DateTime<Utc>,
            last_accessed: DateTime<Utc>,
        }
        
        let helper = Helper::deserialize(deserializer)?;
        Ok(SegmentMetadata {
            id: helper.id,
            start_time: helper.start_time,
            end_time: helper.end_time,
            log_count: helper.log_count,
            size_bytes: helper.size_bytes,
            compressed_size_bytes: helper.compressed_size_bytes,
            tier: helper.tier,
            indexed: helper.indexed,
            path: PathBuf::from(helper.path),
            created_at: helper.created_at,
            last_accessed: helper.last_accessed,
        })
    }
}
