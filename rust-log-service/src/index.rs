use std::sync::Arc;
use tokio::sync::RwLock;
use tantivy::{
    Index, IndexWriter, IndexReader, TantivyDocument,
    schema::{Schema, TEXT, STORED, FAST, Field, Value, STRING, NumericOptions},
    collector::TopDocs,
    query::{QueryParser, BooleanQuery, TermQuery},
    Term,
};
use bloomfilter::Bloom;

use crate::config::Config;
use crate::error::{LogServiceError, Result};
use crate::models::{LogEvent, LogQuery};

pub struct IndexManager {
    index: Index,
    writer: Arc<RwLock<IndexWriter>>,
    reader: IndexReader,
    #[allow(dead_code)]
    schema: Schema,
    
    field_id: Field,
    field_timestamp: Field,
    field_level: Field,
    field_source: Field,
    field_message: Field,
    field_job_id: Field,
    field_workflow_id: Field,
    field_project_id: Field,
    field_execution_id: Field,
    
    bloom_job_ids: Arc<RwLock<Bloom<i64>>>,
    bloom_workflow_ids: Arc<RwLock<Bloom<i64>>>,
}

impl IndexManager {
    pub async fn new(config: &Config) -> Result<Self> {
        let mut schema_builder = Schema::builder();
        
        let field_id = schema_builder.add_text_field("id", STRING | STORED);
        let numeric_opts = NumericOptions::default().set_indexed().set_stored().set_fast();
        let field_timestamp = schema_builder.add_i64_field("timestamp", numeric_opts.clone());
        let field_level = schema_builder.add_u64_field("level", numeric_opts.clone());
        let field_source = schema_builder.add_text_field("source", STRING | STORED);
        let field_message = schema_builder.add_text_field("message", TEXT | STORED);
        let field_job_id = schema_builder.add_i64_field("job_id", numeric_opts.clone());
        let field_workflow_id = schema_builder.add_i64_field("workflow_id", numeric_opts.clone());
        let field_project_id = schema_builder.add_i64_field("project_id", numeric_opts.clone());
        let field_execution_id = schema_builder.add_text_field("execution_id", STRING | STORED);
        
        let schema = schema_builder.build();
        
        std::fs::create_dir_all(&config.index_dir)?;
        
        let index = Index::create_in_dir(&config.index_dir, schema.clone())
            .or_else(|_| Index::open_in_dir(&config.index_dir))
            .map_err(|e| LogServiceError::Index(e.to_string()))?;
        
        let writer = index.writer(50_000_000)
            .map_err(|e| LogServiceError::Index(e.to_string()))?;
        
        let reader = index.reader()
            .map_err(|e| LogServiceError::Index(e.to_string()))?;
        
        let bloom_size = 10_000_000;
        let fp_rate = config.bloom_false_positive_rate;
        let bloom_job_ids = Bloom::new_for_fp_rate(bloom_size, fp_rate);
        let bloom_workflow_ids = Bloom::new_for_fp_rate(bloom_size, fp_rate);
        
        Ok(Self {
            index,
            writer: Arc::new(RwLock::new(writer)),
            reader,
            schema,
            field_id,
            field_timestamp,
            field_level,
            field_source,
            field_message,
            field_job_id,
            field_workflow_id,
            field_project_id,
            field_execution_id,
            bloom_job_ids: Arc::new(RwLock::new(bloom_job_ids)),
            bloom_workflow_ids: Arc::new(RwLock::new(bloom_workflow_ids)),
        })
    }

    pub async fn index_event(&self, event: &LogEvent) -> Result<()> {
        let mut doc = TantivyDocument::default();
        
        doc.add_text(self.field_id, &event.id);
        doc.add_i64(self.field_timestamp, event.timestamp.timestamp_millis());
        doc.add_u64(self.field_level, event.level.as_u8() as u64);
        doc.add_text(self.field_source, event.source.to_string());
        doc.add_text(self.field_message, &event.message);
        
        if let Some(job_id) = event.job_id {
            doc.add_i64(self.field_job_id, job_id);
            self.bloom_job_ids.write().await.set(&job_id);
        }
        
        if let Some(workflow_id) = event.workflow_id {
            doc.add_i64(self.field_workflow_id, workflow_id);
            self.bloom_workflow_ids.write().await.set(&workflow_id);
        }
        
        if let Some(project_id) = event.project_id {
            doc.add_i64(self.field_project_id, project_id);
        }
        
        if let Some(ref execution_id) = event.execution_id {
            doc.add_text(self.field_execution_id, execution_id);
        }
        
        let writer = self.writer.write().await;
        writer.add_document(doc)
            .map_err(|e| LogServiceError::Index(e.to_string()))?;
        
        Ok(())
    }

    pub async fn index_batch(&self, events: &[LogEvent]) -> Result<()> {
        let mut writer = self.writer.write().await;
        
        for event in events {
            let mut doc = TantivyDocument::default();
            
            doc.add_text(self.field_id, &event.id);
            doc.add_i64(self.field_timestamp, event.timestamp.timestamp_millis());
            doc.add_u64(self.field_level, event.level.as_u8() as u64);
            doc.add_text(self.field_source, event.source.to_string());
            doc.add_text(self.field_message, &event.message);
            
            if let Some(job_id) = event.job_id {
                doc.add_i64(self.field_job_id, job_id);
            }
            
            if let Some(workflow_id) = event.workflow_id {
                doc.add_i64(self.field_workflow_id, workflow_id);
            }
            
            if let Some(project_id) = event.project_id {
                doc.add_i64(self.field_project_id, project_id);
            }
            
            if let Some(ref execution_id) = event.execution_id {
                doc.add_text(self.field_execution_id, execution_id);
            }
            
            writer.add_document(doc)
                .map_err(|e| LogServiceError::Index(e.to_string()))?;
        }
        
        Ok(())
    }

    pub async fn commit(&self) -> Result<()> {
        let mut writer = self.writer.write().await;
        writer.commit()
            .map_err(|e| LogServiceError::Index(e.to_string()))?;
        Ok(())
    }

    pub async fn search(&self, query: &LogQuery) -> Result<Vec<String>> {
        if let Some(job_id) = query.job_id {
            if !self.bloom_job_ids.read().await.check(&job_id) {
                return Ok(vec![]);
            }
        }
        
        if let Some(workflow_id) = query.workflow_id {
            if !self.bloom_workflow_ids.read().await.check(&workflow_id) {
                return Ok(vec![]);
            }
        }
        
        let searcher = self.reader.searcher();
        
        let mut subqueries: Vec<(tantivy::query::Occur, Box<dyn tantivy::query::Query>)> = Vec::new();
        
        if let Some(ref search_text) = query.search_text {
            let query_parser = QueryParser::for_index(&self.index, vec![self.field_message]);
            if let Ok(text_query) = query_parser.parse_query(search_text) {
                subqueries.push((tantivy::query::Occur::Must, text_query));
            }
        }
        
        if let Some(job_id) = query.job_id {
            let term = Term::from_field_i64(self.field_job_id, job_id);
            let term_query = TermQuery::new(term, tantivy::schema::IndexRecordOption::Basic);
            subqueries.push((tantivy::query::Occur::Must, Box::new(term_query)));
        }
        
        if let Some(workflow_id) = query.workflow_id {
            let term = Term::from_field_i64(self.field_workflow_id, workflow_id);
            let term_query = TermQuery::new(term, tantivy::schema::IndexRecordOption::Basic);
            subqueries.push((tantivy::query::Occur::Must, Box::new(term_query)));
        }
        
        if let Some(project_id) = query.project_id {
            let term = Term::from_field_i64(self.field_project_id, project_id);
            let term_query = TermQuery::new(term, tantivy::schema::IndexRecordOption::Basic);
            subqueries.push((tantivy::query::Occur::Must, Box::new(term_query)));
        }
        
        if let Some(ref execution_id) = query.execution_id {
            let term = Term::from_field_text(self.field_execution_id, execution_id);
            let term_query = TermQuery::new(term, tantivy::schema::IndexRecordOption::Basic);
            subqueries.push((tantivy::query::Occur::Must, Box::new(term_query)));
        }
        
        if subqueries.is_empty() {
            let all_query = tantivy::query::AllQuery;
            subqueries.push((tantivy::query::Occur::Must, Box::new(all_query)));
        }
        
        let combined_query = BooleanQuery::new(subqueries);
        
        let top_docs = searcher.search(&combined_query, &TopDocs::with_limit(query.limit))
            .map_err(|e| LogServiceError::Query(e.to_string()))?;
        
        let mut ids = Vec::new();
        for (_score, doc_address) in top_docs {
            if let Ok(doc) = searcher.doc::<TantivyDocument>(doc_address) {
                if let Some(id_value) = doc.get_first(self.field_id) {
                    if let Some(id_str) = id_value.as_str() {
                        ids.push(id_str.to_string());
                    }
                }
            }
        }
        
        Ok(ids)
    }

    #[allow(dead_code)]
    pub async fn count_documents(&self) -> Result<u64> {
        let searcher = self.reader.searcher();
        Ok(searcher.num_docs())
    }
}
