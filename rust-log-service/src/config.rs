use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub host: String,
    pub port: u16,
    
    pub data_dir: PathBuf,
    pub index_dir: PathBuf,
    pub archive_dir: PathBuf,
    
    pub segment_size_mb: usize,
    pub flush_interval_secs: u64,
    pub max_buffer_size: usize,
    
    pub compression_level: i32,
    pub enable_dictionary: bool,
    
    pub hot_retention_days: u32,
    pub warm_retention_days: u32,
    pub cold_retention_days: u32,
    
    pub enable_bloom_filters: bool,
    pub bloom_false_positive_rate: f64,
    
    pub max_query_results: usize,
    pub query_timeout_secs: u64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            host: "0.0.0.0".to_string(),
            port: 9000,
            
            data_dir: PathBuf::from("./log-data/segments"),
            index_dir: PathBuf::from("./log-data/index"),
            archive_dir: PathBuf::from("./log-data/archive"),
            
            segment_size_mb: 256,
            flush_interval_secs: 30,
            max_buffer_size: 100_000,
            
            compression_level: 6,
            enable_dictionary: true,
            
            hot_retention_days: 7,
            warm_retention_days: 30,
            cold_retention_days: 365,
            
            enable_bloom_filters: true,
            bloom_false_positive_rate: 0.01,
            
            max_query_results: 10_000,
            query_timeout_secs: 30,
        }
    }
}

impl Config {
    pub fn load() -> anyhow::Result<Self> {
        let config = config::Config::builder()
            .add_source(config::File::with_name("log-service-config").required(false))
            .add_source(config::Environment::with_prefix("LOG_SERVICE"))
            .build()?;

        let mut cfg: Config = config.try_deserialize().unwrap_or_default();
        
        if let Ok(port) = std::env::var("LOG_SERVICE_PORT") {
            cfg.port = port.parse().unwrap_or(9000);
        }
        
        if let Ok(data_dir) = std::env::var("LOG_SERVICE_DATA_DIR") {
            cfg.data_dir = PathBuf::from(data_dir);
        }

        std::fs::create_dir_all(&cfg.data_dir)?;
        std::fs::create_dir_all(&cfg.index_dir)?;
        std::fs::create_dir_all(&cfg.archive_dir)?;

        Ok(cfg)
    }
    
    pub fn segment_size_bytes(&self) -> usize {
        self.segment_size_mb * 1024 * 1024
    }
}
