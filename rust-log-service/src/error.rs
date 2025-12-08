use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum LogServiceError {
    #[error("Storage error: {0}")]
    Storage(String),

    #[error("Index error: {0}")]
    Index(String),

    #[error("Compression error: {0}")]
    Compression(String),

    #[error("Segment error: {0}")]
    Segment(String),

    #[error("Query error: {0}")]
    Query(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Timeout: {0}")]
    Timeout(String),
}

impl IntoResponse for LogServiceError {
    fn into_response(self) -> Response {
        let (status, error_message) = match &self {
            LogServiceError::Storage(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.clone()),
            LogServiceError::Index(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.clone()),
            LogServiceError::Compression(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.clone()),
            LogServiceError::Segment(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.clone()),
            LogServiceError::Query(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            LogServiceError::Validation(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            LogServiceError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            LogServiceError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.clone()),
            LogServiceError::Timeout(msg) => (StatusCode::REQUEST_TIMEOUT, msg.clone()),
        };

        let body = Json(json!({
            "error": error_message,
            "code": status.as_u16()
        }));

        (status, body).into_response()
    }
}

impl From<std::io::Error> for LogServiceError {
    fn from(err: std::io::Error) -> Self {
        LogServiceError::Storage(err.to_string())
    }
}

impl From<serde_json::Error> for LogServiceError {
    fn from(err: serde_json::Error) -> Self {
        LogServiceError::Validation(err.to_string())
    }
}

impl From<tantivy::TantivyError> for LogServiceError {
    fn from(err: tantivy::TantivyError) -> Self {
        LogServiceError::Index(err.to_string())
    }
}

impl From<parquet::errors::ParquetError> for LogServiceError {
    fn from(err: parquet::errors::ParquetError) -> Self {
        LogServiceError::Storage(err.to_string())
    }
}

impl From<arrow::error::ArrowError> for LogServiceError {
    fn from(err: arrow::error::ArrowError) -> Self {
        LogServiceError::Storage(err.to_string())
    }
}

pub type Result<T> = std::result::Result<T, LogServiceError>;
