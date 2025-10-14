# Data File Observatory - DBT Project

This DBT project provides production-grade data transformations for the Data File Observatory platform.

## Structure

```
dbt_project/
├── models/
│   ├── staging/         # Raw data staging models (1:1 with sources)
│   ├── intermediate/    # Business logic transformations
│   └── marts/           # Final analytics-ready tables
├── tests/               # Data quality tests
├── macros/              # Reusable SQL functions
├── seeds/               # Static reference data (CSVs)
└── snapshots/           # Slowly changing dimension tracking
```

## Usage

### Run all models
```bash
cd dbt_project
DBT_PROFILES_DIR=. dbt run
```

### Run specific model
```bash
DBT_PROFILES_DIR=. dbt run --select model_name
```

### Run tests
```bash
DBT_PROFILES_DIR=. dbt test
```

### Generate documentation
```bash
DBT_PROFILES_DIR=. dbt docs generate
DBT_PROFILES_DIR=. dbt docs serve
```

## Environment Variables

Required environment variables (automatically set in Replit):
- `PGHOST` - PostgreSQL host
- `PGUSER` - PostgreSQL user
- `PGPASSWORD` - PostgreSQL password  
- `PGPORT` - PostgreSQL port
- `PGDATABASE` - PostgreSQL database name

## Targets

- **dev** (default): Development schema (`dbt_dev`)
- **prod**: Production schema (`dbt_prod`)

Switch targets: `dbt run --target prod`
