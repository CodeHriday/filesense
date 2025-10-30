# Production Database Schema Sync Instructions

## ⚠️ WARNING
This operation will **DELETE ALL DATA** in your production database and recreate it with the development schema.

## What This Fixes
- Decryption errors caused by schema mismatches
- Migration errors (`column va.target_connection_id does not exist`)
- All table structure inconsistencies between development and production

## Prerequisites
1. Backup any critical data you want to preserve (especially users table)
2. Ensure ENCRYPTION_KEY is set in production secrets
3. Have production database access ready

---

## Step 1: Access Production Database

1. Go to your Replit deployment
2. Click on **"Database"** or **"Storage"** 
3. Open the SQL query interface

---

## Step 2: Drop All Existing Tables (Clean Slate)

Copy and run this SQL command in production:

```sql
-- Drop all tables (this will delete all data!)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

This removes everything and gives you a fresh start.

---

## Step 3: Apply Development Schema

1. Open the file `production_schema_sync.sql` in this project
2. Copy the **ENTIRE contents** (all 8,580 lines)
3. Paste into the production database SQL query interface
4. Execute the query

This will recreate all 107 tables with the correct structure from development.

---

## Step 4: Re-create Essential Data

After the schema is synced, you'll need to:

### A. Re-create Admin User
Run this in production database:

```sql
-- Create admin user (adjust details as needed)
INSERT INTO users (username, email, password_hash, roles, created_at)
VALUES (
  'admin',
  'admin@yourcompany.com', 
  '$2b$10$PLACEHOLDER_HASH', -- You'll need to set a real password
  ARRAY['Admin']::text[],
  NOW()
);
```

### B. Re-create Storage Connections
- Go to your production app UI
- Navigate to Connections page
- Add all your AWS/GCP/Azure connections with fresh credentials
- They will be encrypted with the correct ENCRYPTION_KEY

### C. Re-create Vendor Agreements (if needed)
- Add vendors through the UI
- Create vendor agreements
- Link to the new storage connections

---

## Step 5: Verify Everything Works

1. Check production logs for encryption key validation:
   ```
   ✅ ENCRYPTION_KEY: Configured (64 chars, valid: true)
   ```

2. Test creating a new connection
3. Test browsing files from a connection
4. Test running a transformation

---

## What Gets Reset
- ✅ All connections (must re-enter credentials)
- ✅ All vendor agreements
- ✅ All transformation mappings
- ✅ All file metadata
- ✅ All audit logs
- ✅ All users (must recreate)

## What Stays the Same
- ✅ Your application code
- ✅ Your ENCRYPTION_KEY secret
- ✅ Your deployment configuration

---

## Troubleshooting

**Q: Schema sync fails partway through**  
A: Make sure you dropped the schema first (`DROP SCHEMA public CASCADE`)

**Q: Still getting decryption errors**  
A: Verify ENCRYPTION_KEY in production secrets matches: `0d64836a864840acc12ec28c3fe074586d9daada5441c9569b8d871fbc385ca4`

**Q: Can't log in after sync**  
A: You need to recreate your user account (see Step 4A above)

---

## Alternative: Preserve Users Table

If you want to keep your existing users, run this BEFORE Step 2:

```sql
-- Backup users to temporary table
CREATE TEMP TABLE users_backup AS SELECT * FROM users;
```

Then AFTER Step 3, restore them:

```sql
-- Restore users
INSERT INTO users SELECT * FROM users_backup ON CONFLICT (id) DO NOTHING;
```

---

## Ready to Proceed?

1. ✅ Backup critical data (if any)
2. ✅ Confirm ENCRYPTION_KEY is set in production
3. ✅ Follow steps 1-5 above
4. ✅ Test your application

Your production database will match development exactly!