mod config;
mod error;
mod models;
mod storage;
mod index;
mod compression;
mod api;
mod segment;
mod lifecycle;

use std::sync::Arc;
use axum::{
    routing::{get, post},
    Router,
};
use tower_http::cors::{CorsLayer, Any};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::config::Config;
use crate::storage::StorageManager;
use crate::index::IndexManager;
use crate::segment::SegmentManager;
use crate::lifecycle::LifecycleManager;

pub struct AppState {
    pub config: Config,
    pub storage: StorageManager,
    pub index: IndexManager,
    pub segments: SegmentManager,
    pub lifecycle: LifecycleManager,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "log_service=info,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    tracing::info!("Starting Log Service v{}", env!("CARGO_PKG_VERSION"));

    let config = Config::load()?;
    
    let storage = StorageManager::new(&config).await?;
    let index = IndexManager::new(&config).await?;
    let segments = SegmentManager::new(&config).await?;
    let lifecycle = LifecycleManager::new(&config);

    let state = Arc::new(AppState {
        config: config.clone(),
        storage,
        index,
        segments,
        lifecycle,
    });

    lifecycle::spawn_lifecycle_tasks(state.clone());

    let app = Router::new()
        .route("/health", get(api::health_check))
        .route("/api/logs", post(api::ingest_logs))
        .route("/api/logs/batch", post(api::ingest_batch))
        .route("/api/logs/query", post(api::query_logs))
        .route("/api/logs/search", post(api::search_logs))
        .route("/api/logs/tail", get(api::tail_logs))
        .route("/api/segments", get(api::list_segments))
        .route("/api/segments/:id", get(api::get_segment))
        .route("/api/stats", get(api::get_stats))
        .layer(TraceLayer::new_for_http())
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state);

    let addr = format!("{}:{}", config.host, config.port);
    tracing::info!("Log service listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
