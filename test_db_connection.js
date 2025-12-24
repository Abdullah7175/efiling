const { Pool } = require('pg');

// Database configuration with default values
const pool = new Pool({
  user: 'root',
  host: 'localhost',
  database: 'warehouse',
  password: '', // You may need to set this
  port: 5432,
  ssl: false,
});

async function testConnection() {
  const client = await pool.connect();
  
  try {
    console.log('Testing database connection...');
    
    // Test basic connection
    const result = await client.query('SELECT NOW()');
    console.log('✅ Database connection successful:', result.rows[0]);
    
    // Check if e-filing tables exist
    const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'efiling_%'
    `);
    
    console.log('Existing e-filing tables:', tableCheck.rows.map(r => r.table_name));
    
    if (tableCheck.rows.length === 0) {
      console.log('No e-filing tables found. Creating them...');
      
      // Read and execute the migration SQL
      const fs = require('fs');
      const migrationSQL = fs.readFileSync('create_efiling_tables.sql', 'utf8');
      
      await client.query(migrationSQL);
      console.log('✅ E-filing tables created successfully!');
      
      // Insert some test data
      await client.query(`
        INSERT INTO efiling_departments (name, code, description) 
        VALUES 
          ('Administration', 'ADMIN', 'Administrative Department'),
          ('Finance', 'FIN', 'Finance Department'),
          ('IT', 'IT', 'Information Technology Department')
        ON CONFLICT (code) DO NOTHING;
      `);
      
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
      
      await client.query(`
        INSERT INTO efiling_file_categories (name, code, description, department_id) 
        VALUES 
          ('General Correspondence', 'GEN_CORR', 'General correspondence files', 1),
          ('Financial Documents', 'FIN_DOC', 'Financial documents and reports', 2),
          ('Technical Reports', 'TECH_REP', 'Technical reports and documentation', 3)
        ON CONFLICT (code) DO NOTHING;
      `);
      
      console.log('✅ Test data inserted successfully!');
    } else {
      console.log('✅ E-filing tables already exist!');
    }
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Error details:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

testConnection(); 