use std::sync::Arc;
use std::time::Instant;
use axum::{
    extract::{Path, State, Query, WebSocketUpgrade},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};

use crate::error::{LogServiceError, Result};
use crate::models::{LogEvent, LogBatch, LogQuery, LogQueryResult, ServiceStats};
use crate::AppState;

#[derive(Serialize)]
pub struct HealthResponse {
    status: String,
    version: String,
    uptime_secs: u64,
    buffer_count: usize,
    segment_count: usize,
}

static START_TIME: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();

pub async fn health_check(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let start = START_TIME.get_or_init(Instant::now);
    let uptime = start.elapsed().as_secs();
    
    let buffer_count = state.storage.buffer_count().await;
    let segment_count = state.segments.list_all().await.map(|s| s.len()).unwrap_or(0);
    
    Json(HealthResponse {
        status: "healthy".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_secs: uptime,
        buffer_count,
        segment_count,
    })
}

pub async fn ingest_logs(
    State(state): State<Arc<AppState>>,
    Json(event): Json<LogEvent>,
) -> Result<impl IntoResponse> {
    state.storage.append(event.clone()).await?;
    
    state.index.index_event(&event).await?;
    
    Ok(Json(serde_json::json!({
        "success": true,
        "id": event.id
    })))
}

pub async fn ingest_batch(
    State(state): State<Arc<AppState>>,
    Json(batch): Json<LogBatch>,
) -> Result<impl IntoResponse> {
    let count = batch.logs.len();
    
    state.storage.append_batch(batch.logs.clone()).await?;
    
    state.index.index_batch(&batch.logs).await?;
    
    Ok(Json(serde_json::json!({
        "success": true,
        "count": count
    })))
}

pub async fn query_logs(
    State(state): State<Arc<AppState>>,
    Json(query): Json<LogQuery>,
) -> Result<impl IntoResponse> {
    let start = Instant::now();
    
    let mut all_events = Vec::new();
    
    if let (Some(start_time), Some(end_time)) = (query.start_time, query.end_time) {
        let segments = state.segments.find_segments_in_range(start_time, end_time).await?;
        
        for segment in segments {
            let events = state.storage.read_segment(&segment.id).await?;
            all_events.extend(events);
        }
    } else {
        let segments = state.segments.list_all().await?;
        for segment in segments.iter().take(10) {
            if let Ok(events) = state.storage.read_segment(&segment.id).await {
                all_events.extend(events);
            }
        }
    }
    
    if let Some(ref levels) = query.levels {
        all_events.retain(|e| levels.contains(&e.level));
    }
    
    if let Some(ref sources) = query.sources {
        all_events.retain(|e| sources.contains(&e.source));
    }
    
    if let Some(job_id) = query.job_id {
        all_events.retain(|e| e.job_id == Some(job_id));
    }
    
    if let Some(workflow_id) = query.workflow_id {
        all_events.retain(|e| e.workflow_id == Some(workflow_id));
    }
    
    if let Some(project_id) = query.project_id {
        all_events.retain(|e| e.project_id == Some(project_id));
    }
    
    if let Some(ref execution_id) = query.execution_id {
        all_events.retain(|e| e.execution_id.as_ref() == Some(execution_id));
    }
    
    if query.sort_desc {
        all_events.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    } else {
        all_events.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
    }
    
    let total = all_events.len();
    let has_more = total > query.offset + query.limit;
    
    let events: Vec<LogEvent> = all_events
        .into_iter()
        .skip(query.offset)
        .take(query.limit)
        .collect();
    
    let query_time_ms = start.elapsed().as_millis() as u64;
    
    Ok(Json(LogQueryResult {
        logs: events,
        total,
        has_more,
        query_time_ms,
    }))
}

pub async fn search_logs(
    State(state): State<Arc<AppState>>,
    Json(query): Json<LogQuery>,
) -> Result<impl IntoResponse> {
    let start = Instant::now();
    
    let ids = state.index.search(&query).await?;
    
    let query_time_ms = start.elapsed().as_millis() as u64;
    
    Ok(Json(serde_json::json!({
        "ids": ids,
        "count": ids.len(),
        "query_time_ms": query_time_ms
    })))
}

pub async fn tail_logs(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> Response {
    ws.on_upgrade(|socket| handle_tail_socket(socket, state))
}

async fn handle_tail_socket(
    mut socket: axum::extract::ws::WebSocket,
    state: Arc<AppState>,
) {
    use axum::extract::ws::Message;
    
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(1));
    
    loop {
        interval.tick().await;
        
        if socket.send(Message::Ping(vec![])).await.is_err() {
            break;
        }
    }
}

pub async fn list_segments(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse> {
    let segments = state.segments.list_all().await?;
    Ok(Json(segments))
}

pub async fn get_segment(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    match state.segments.get_segment(&id).await? {
        Some(segment) => Ok(Json(segment.to_segment_info())),
        None => Err(LogServiceError::NotFound(format!("Segment {} not found", id))),
    }
}

pub async fn get_stats(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse> {
    let start = START_TIME.get_or_init(Instant::now);
    let uptime = start.elapsed().as_secs();
    
    let (total_size, compressed_size, total_logs) = state.segments.total_stats().await?;
    let segments = state.segments.list_all().await?;
    
    let mut segments_by_tier = std::collections::HashMap::new();
    for segment in &segments {
        *segments_by_tier.entry(segment.tier.to_string()).or_insert(0) += 1;
    }
    
    let compression_ratio = if compressed_size > 0 {
        total_size as f64 / compressed_size as f64
    } else {
        0.0
    };
    
    Ok(Json(ServiceStats {
        total_logs: total_logs as u64,
        total_segments: segments.len(),
        total_size_bytes: total_size,
        compressed_size_bytes: compressed_size,
        overall_compression_ratio: compression_ratio,
        logs_per_second: if uptime > 0 { total_logs as f64 / uptime as f64 } else { 0.0 },
        segments_by_tier,
        uptime_secs: uptime,
    }))
}
