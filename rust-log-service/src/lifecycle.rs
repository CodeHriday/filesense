use std::sync::Arc;
use chrono::{Duration, Utc};
use tokio::time::{interval, Duration as TokioDuration};

use crate::config::Config;
use crate::models::StorageTier;
use crate::AppState;

pub struct LifecycleManager {
    config: Config,
}

impl LifecycleManager {
    pub fn new(config: &Config) -> Self {
        Self {
            config: config.clone(),
        }
    }

    pub fn hot_cutoff(&self) -> chrono::DateTime<Utc> {
        Utc::now() - Duration::days(self.config.hot_retention_days as i64)
    }

    pub fn warm_cutoff(&self) -> chrono::DateTime<Utc> {
        Utc::now() - Duration::days(self.config.warm_retention_days as i64)
    }

    pub fn cold_cutoff(&self) -> chrono::DateTime<Utc> {
        Utc::now() - Duration::days(self.config.cold_retention_days as i64)
    }
}

pub fn spawn_lifecycle_tasks(state: Arc<AppState>) {
    let state_clone = state.clone();
    tokio::spawn(async move {
        run_flush_task(state_clone).await;
    });

    let state_clone = state.clone();
    tokio::spawn(async move {
        run_tier_migration_task(state_clone).await;
    });

    let state_clone = state.clone();
    tokio::spawn(async move {
        run_cleanup_task(state_clone).await;
    });
}

async fn run_flush_task(state: Arc<AppState>) {
    let mut interval = interval(TokioDuration::from_secs(state.config.flush_interval_secs));
    
    loop {
        interval.tick().await;
        
        match state.storage.flush().await {
            Ok(Some(segment_info)) => {
                tracing::info!(
                    segment_id = %segment_info.id,
                    log_count = segment_info.log_count,
                    compression_ratio = segment_info.compression_ratio,
                    "Flushed segment to storage"
                );
                
                let path = state.config.data_dir.join(format!("{}.parquet", segment_info.id));
                if let Err(e) = state.segments.register_segment(segment_info, path).await {
                    tracing::error!(error = %e, "Failed to register segment");
                }
            }
            Ok(None) => {
            }
            Err(e) => {
                tracing::error!(error = %e, "Failed to flush storage buffer");
            }
        }
    }
}

async fn run_tier_migration_task(state: Arc<AppState>) {
    let mut interval = interval(TokioDuration::from_secs(3600));
    
    loop {
        interval.tick().await;
        
        tracing::info!("Running tier migration check");
        
        let hot_cutoff = state.lifecycle.hot_cutoff();
        let warm_cutoff = state.lifecycle.warm_cutoff();
        
        if let Ok(hot_segments) = state.segments.get_segments_by_tier(StorageTier::Hot).await {
            for segment in hot_segments {
                if segment.end_time < hot_cutoff {
                    tracing::info!(
                        segment_id = %segment.id,
                        "Migrating segment from hot to warm tier"
                    );
                    
                    let warm_dir = state.config.archive_dir.join("warm");
                    if let Err(e) = std::fs::create_dir_all(&warm_dir) {
                        tracing::error!(error = %e, "Failed to create warm directory");
                        continue;
                    }
                    
                    let old_path = segment.path.clone();
                    let new_path = warm_dir.join(format!("{}.parquet", segment.id));
                    
                    if let Err(e) = std::fs::rename(&old_path, &new_path) {
                        tracing::error!(error = %e, "Failed to move segment to warm tier");
                        continue;
                    }
                    
                    if let Err(e) = state.segments.update_tier(&segment.id, StorageTier::Warm, new_path).await {
                        tracing::error!(error = %e, "Failed to update segment tier metadata");
                    }
                }
            }
        }
        
        if let Ok(warm_segments) = state.segments.get_segments_by_tier(StorageTier::Warm).await {
            for segment in warm_segments {
                if segment.end_time < warm_cutoff {
                    tracing::info!(
                        segment_id = %segment.id,
                        "Migrating segment from warm to cold tier"
                    );
                    
                    let cold_dir = state.config.archive_dir.join("cold");
                    if let Err(e) = std::fs::create_dir_all(&cold_dir) {
                        tracing::error!(error = %e, "Failed to create cold directory");
                        continue;
                    }
                    
                    let old_path = segment.path.clone();
                    let new_path = cold_dir.join(format!("{}.parquet", segment.id));
                    
                    if let Err(e) = std::fs::rename(&old_path, &new_path) {
                        tracing::error!(error = %e, "Failed to move segment to cold tier");
                        continue;
                    }
                    
                    if let Err(e) = state.segments.update_tier(&segment.id, StorageTier::Cold, new_path).await {
                        tracing::error!(error = %e, "Failed to update segment tier metadata");
                    }
                }
            }
        }
    }
}

async fn run_cleanup_task(state: Arc<AppState>) {
    let mut interval = interval(TokioDuration::from_secs(86400));
    
    loop {
        interval.tick().await;
        
        tracing::info!("Running cleanup task");
        
        let cold_cutoff = state.lifecycle.cold_cutoff();
        
        if let Ok(cold_segments) = state.segments.get_segments_by_tier(StorageTier::Cold).await {
            for segment in cold_segments {
                if segment.end_time < cold_cutoff {
                    tracing::info!(
                        segment_id = %segment.id,
                        "Deleting expired segment"
                    );
                    
                    if let Err(e) = std::fs::remove_file(&segment.path) {
                        tracing::error!(error = %e, "Failed to delete segment file");
                        continue;
                    }
                    
                    if let Err(e) = state.segments.remove_segment(&segment.id).await {
                        tracing::error!(error = %e, "Failed to remove segment metadata");
                    }
                }
            }
        }
    }
}
