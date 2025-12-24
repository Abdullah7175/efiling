const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'wmp',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});

async function checkFileTypes() {
    const client = await pool.connect();
    try {
        console.log('Checking file types and their codes...\n');
        
        // Get all file types
        const fileTypesResult = await client.query(`
            SELECT ft.id, ft.name, ft.code, ft.department_id, d.name as department_name
            FROM efiling_file_types ft
            LEFT JOIN efiling_departments d ON ft.department_id = d.id
            ORDER BY ft.id
        `);
        
        console.log('File Types:');
        console.log('ID | Name | Code | Department ID | Department Name');
        console.log('---|------|------|---------------|----------------');
        fileTypesResult.rows.forEach(row => {
            console.log(`${row.id} | ${row.name} | ${row.code} | ${row.department_id} | ${row.department_name}`);
        });
        
        console.log('\nChecking files and their file types...\n');
        
        // Get files with their file types
        const filesResult = await client.query(`
            SELECT f.id, f.file_number, f.subject, f.file_type_id, ft.code as file_type_code, ft.name as file_type_name,
                   f.created_by, eu.designation as creator_name
            FROM efiling_files f
            LEFT JOIN efiling_file_types ft ON f.file_type_id = ft.id
            LEFT JOIN efiling_users eu ON f.created_by = eu.id
            ORDER BY f.id
        `);
        
        console.log('Files:');
        console.log('ID | File Number | Subject | File Type ID | File Type Code | File Type Name | Created By | Creator Name');
        console.log('---|-------------|---------|--------------|----------------|----------------|------------|-------------');
        filesResult.rows.forEach(row => {
            console.log(`${row.id} | ${row.file_number} | ${row.subject} | ${row.file_type_id} | ${row.file_type_code} | ${row.file_type_name} | ${row.created_by} | ${row.creator_name}`);
        });
        
        console.log('\nChecking user 3 (efiling user) files specifically...\n');
        
        // Check files created by efiling user 3
        const user3FilesResult = await client.query(`
            SELECT f.id, f.file_number, f.subject, f.file_type_id, ft.code as file_type_code, ft.name as file_type_name,
                   f.created_by, eu.designation as creator_name, u.email as creator_email
            FROM efiling_files f
            LEFT JOIN efiling_file_types ft ON f.file_type_id = ft.id
            LEFT JOIN efiling_users eu ON f.created_by = eu.id
            LEFT JOIN users u ON eu.user_id = u.id
            WHERE f.created_by = 3
            ORDER BY f.id
        `);
        
        console.log('Files created by efiling user 3:');
        console.log('ID | File Number | Subject | File Type ID | File Type Code | File Type Name | Creator Email');
        console.log('---|-------------|---------|--------------|----------------|----------------|-------------');
        user3FilesResult.rows.forEach(row => {
            console.log(`${row.id} | ${row.file_number} | ${row.subject} | ${row.file_type_id} | ${row.file_type_code} | ${row.file_type_name} | ${row.creator_email}`);
        });
        
        console.log('\nChecking efiling user 3 details...\n');
        
        // Check efiling user 3 details
        const user3Result = await client.query(`
            SELECT eu.id, eu.designation, eu.department_id, d.name as department_name, 
                   eu.efiling_role_id, er.code as role_code, u.email, u.id as user_id
            FROM efiling_users eu
            LEFT JOIN efiling_departments d ON eu.department_id = d.id
            LEFT JOIN efiling_roles er ON eu.efiling_role_id = er.id
            LEFT JOIN users u ON eu.user_id = u.id
            WHERE eu.id = 3
        `);
        
        console.log('Efiling User 3 Details:');
        user3Result.rows.forEach(row => {
            console.log(`ID: ${row.id}, Designation: ${row.designation}, Department: ${row.department_id} (${row.department_name}), Role: ${row.efiling_role_id} (${row.role_code}), User ID: ${row.user_id}, Email: ${row.email}`);
        });
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

checkFileTypes();
