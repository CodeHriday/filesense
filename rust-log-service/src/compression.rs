use std::io::{Read, Write};
use zstd::stream::{Encoder, Decoder};
use zstd::dict::{EncoderDictionary, DecoderDictionary};

use crate::error::{LogServiceError, Result};

#[allow(dead_code)]
pub struct CompressionEngine {
    level: i32,
    enable_dictionary: bool,
    dictionary: Option<Vec<u8>>,
}

impl CompressionEngine {
    pub fn new(level: i32, enable_dictionary: bool) -> Self {
        Self {
            level,
            enable_dictionary,
            dictionary: None,
        }
    }

    pub fn compress(&self, data: &[u8]) -> Result<Vec<u8>> {
        let mut encoder = Encoder::new(Vec::new(), self.level)
            .map_err(|e| LogServiceError::Compression(e.to_string()))?;
        
        encoder.write_all(data)
            .map_err(|e| LogServiceError::Compression(e.to_string()))?;
        
        encoder.finish()
            .map_err(|e| LogServiceError::Compression(e.to_string()))
    }

    pub fn decompress(&self, data: &[u8]) -> Result<Vec<u8>> {
        let mut decoder = Decoder::new(data)
            .map_err(|e| LogServiceError::Compression(e.to_string()))?;
        
        let mut result = Vec::new();
        decoder.read_to_end(&mut result)
            .map_err(|e| LogServiceError::Compression(e.to_string()))?;
        
        Ok(result)
    }

    pub fn train_dictionary(&mut self, samples: &[Vec<u8>], dict_size: usize) -> Result<()> {
        if !self.enable_dictionary {
            return Ok(());
        }

        let sample_sizes: Vec<usize> = samples.iter().map(|s| s.len()).collect();
        let flat_samples: Vec<u8> = samples.iter().flatten().copied().collect();
        
        let dict = zstd::dict::from_continuous(&flat_samples, &sample_sizes, dict_size)
            .map_err(|e| LogServiceError::Compression(format!("Dictionary training failed: {}", e)))?;
        
        self.dictionary = Some(dict);
        Ok(())
    }

    pub fn compress_with_dictionary(&self, data: &[u8]) -> Result<Vec<u8>> {
        match &self.dictionary {
            Some(dict) => {
                let encoder_dict = EncoderDictionary::copy(dict, self.level);
                let mut encoder = Encoder::with_prepared_dictionary(Vec::new(), &encoder_dict)
                    .map_err(|e| LogServiceError::Compression(e.to_string()))?;
                
                encoder.write_all(data)
                    .map_err(|e| LogServiceError::Compression(e.to_string()))?;
                
                encoder.finish()
                    .map_err(|e| LogServiceError::Compression(e.to_string()))
            }
            None => self.compress(data),
        }
    }

    pub fn decompress_with_dictionary(&self, data: &[u8]) -> Result<Vec<u8>> {
        match &self.dictionary {
            Some(dict) => {
                let decoder_dict = DecoderDictionary::copy(dict);
                let mut decoder = Decoder::with_prepared_dictionary(data, &decoder_dict)
                    .map_err(|e| LogServiceError::Compression(e.to_string()))?;
                
                let mut result = Vec::new();
                decoder.read_to_end(&mut result)
                    .map_err(|e| LogServiceError::Compression(e.to_string()))?;
                
                Ok(result)
            }
            None => self.decompress(data),
        }
    }

    #[allow(dead_code)]
    pub fn compression_ratio(original: usize, compressed: usize) -> f64 {
        if compressed == 0 {
            return 0.0;
        }
        original as f64 / compressed as f64
    }

    #[allow(dead_code)]
    pub fn estimate_size_reduction(ratio: f64) -> f64 {
        if ratio <= 1.0 {
            return 0.0;
        }
        (1.0 - (1.0 / ratio)) * 100.0
    }
}

#[allow(dead_code)]
pub struct LZ4Compressor;

#[allow(dead_code)]
impl LZ4Compressor {
    pub fn compress(data: &[u8]) -> Result<Vec<u8>> {
        Ok(lz4_flex::compress_prepend_size(data))
    }

    pub fn decompress(data: &[u8]) -> Result<Vec<u8>> {
        lz4_flex::decompress_size_prepended(data)
            .map_err(|e| LogServiceError::Compression(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compression_roundtrip() {
        let engine = CompressionEngine::new(6, false);
        let original = b"Hello, this is a test message for compression. It should compress well with repetition repetition repetition.";
        
        let compressed = engine.compress(original).unwrap();
        let decompressed = engine.decompress(&compressed).unwrap();
        
        assert_eq!(original.as_slice(), decompressed.as_slice());
        assert!(compressed.len() < original.len());
    }

    #[test]
    fn test_lz4_compression() {
        let original = b"Fast compression test data with some repetition repetition repetition for better compression ratio.";
        
        let compressed = LZ4Compressor::compress(original).unwrap();
        let decompressed = LZ4Compressor::decompress(&compressed).unwrap();
        
        assert_eq!(original.as_slice(), decompressed.as_slice());
    }
}
