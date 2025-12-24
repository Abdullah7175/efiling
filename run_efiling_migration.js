const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
  user: process.env.DB_USER || 'root',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'warehouse',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Starting e-filing database migration...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'create_efiling_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Executing migration SQL...');
    await client.query(migrationSQL);
    
    console.log('✅ E-filing tables created successfully!');
    
    // Insert some default data
    console.log('Inserting default data...');
    
    // Insert default departments
    await client.query(`
      INSERT INTO efiling_departments (name, code, description) 
      VALUES 
        ('Administration', 'ADMIN', 'Administrative Department'),
        ('Finance', 'FIN', 'Finance Department'),
        ('IT', 'IT', 'Information Technology Department')
      ON CONFLICT (code) DO NOTHING;
    `);
    
    // Insert default file statuses
    await client.query(`
      INSERT INTO efiling_file_status (name, code, description, color) 
      VALUES 
        ('Draft', 'DRAFT', 'File is in draft status', '#6B7280'),
        ('Pending', 'PENDING', 'File is pending review', '#F59E0B'),
        ('In Progress', 'IN_PROGRESS', 'File is being processed', '#3B82F6'),
        ('Completed', 'COMPLETED', 'File has been completed', '#10B981'),
        ('Rejected', 'REJECTED', 'File has been rejected', '#EF4444')
      ON CONFLICT (code) DO NOTHING;
    `);
    
    // Insert default categories
    await client.query(`
      INSERT INTO efiling_file_categories (name, code, description, department_id) 
      VALUES 
        ('General Correspondence', 'GEN_CORR', 'General correspondence files', 1),
        ('Financial Documents', 'FIN_DOC', 'Financial documents and reports', 2),
        ('Technical Reports', 'TECH_REP', 'Technical reports and documentation', 3)
      ON CONFLICT (code) DO NOTHING;
    `);
    
    console.log('✅ Default data inserted successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  }); 