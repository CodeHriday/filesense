// Database schema for Groups, Business Processes, and Jobs

/* 
These are the tables needed to properly implement the Business Process Management features:

1. groups - Store groups that users can create
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

2. user_groups - Join table to associate users with groups
CREATE TABLE IF NOT EXISTS user_groups (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  group_id UUID NOT NULL REFERENCES groups(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, group_id)
);

3. business_processes - Store business processes
CREATE TABLE IF NOT EXISTS business_processes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  group_id UUID NOT NULL REFERENCES groups(id),
  created_by UUID NOT NULL REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

4. jobs - Store jobs within business processes
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  business_process_id UUID NOT NULL REFERENCES business_processes(id),
  source_connection_id INTEGER REFERENCES connections(id),
  target_connection_id INTEGER REFERENCES connections(id),
  validation_settings JSONB,
  error_handling_settings JSONB,
  notification_settings JSONB,
  schedule_settings JSONB,
  created_by UUID NOT NULL REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

5. job_runs - Store history of job executions
CREATE TABLE IF NOT EXISTS job_runs (
  id SERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES jobs(id),
  status VARCHAR(50) NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP WITH TIME ZONE,
  records_processed INTEGER,
  records_failed INTEGER,
  error_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

6. job_groups - Store job groups for organization
CREATE TABLE IF NOT EXISTS job_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

7. job_group_jobs - Associate jobs with job groups
CREATE TABLE IF NOT EXISTS job_group_jobs (
  id SERIAL PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES job_groups(id),
  job_id UUID NOT NULL REFERENCES jobs(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, job_id)
);
*/