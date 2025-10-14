{{
  config(
    materialized='view',
    tags=['staging', 'files']
  )
}}

with source as (
    select * from {{ source('uploaded_files', 'files') }}
),

renamed as (
    select
        file_id,
        filename,
        file_type,
        file_size,
        row_count,
        column_count,
        quality_score,
        created_at,
        updated_at
    from source
)

select * from renamed
