// Simple test script to verify the files API is working
// This can be run in the browser console when logged in

async function testFilesAPI() {
    console.log('Testing Files API...');
    
    try {
        // Test 1: Check if user profile API works
        console.log('\n1. Testing user profile API...');
        const profileRes = await fetch('/api/efiling/users/profile?userId=9'); // xen@xen.com user ID
        console.log('Profile API Status:', profileRes.status);
        if (profileRes.ok) {
            const profile = await profileRes.json();
            console.log('Profile Data:', profile);
            console.log('Efiling User ID:', profile.efiling_user_id);
        } else {
            console.error('Profile API failed:', await profileRes.text());
        }
        
        // Test 2: Test files API for created_by=3
        console.log('\n2. Testing files API for created_by=3...');
        const filesRes = await fetch('/api/efiling/files?created_by=3');
        console.log('Files API Status:', filesRes.status);
        if (filesRes.ok) {
            const files = await filesRes.json();
            console.log('Files Response:', files);
            console.log('Number of files found:', files.files?.length || 0);
            if (files.files?.length > 0) {
                console.log('Sample file:', files.files[0]);
            }
        } else {
            console.error('Files API failed:', await filesRes.text());
        }
        
        // Test 3: Test files API for assigned_to=3
        console.log('\n3. Testing files API for assigned_to=3...');
        const assignedRes = await fetch('/api/efiling/files?assigned_to=3');
        console.log('Assigned Files API Status:', assignedRes.status);
        if (assignedRes.ok) {
            const assigned = await assignedRes.json();
            console.log('Assigned Files Response:', assigned);
            console.log('Number of assigned files found:', assigned.files?.length || 0);
        } else {
            console.error('Assigned Files API failed:', await assignedRes.text());
        }
        
        // Test 4: Test all files (no filter)
        console.log('\n4. Testing all files API...');
        const allFilesRes = await fetch('/api/efiling/files');
        console.log('All Files API Status:', allFilesRes.status);
        if (allFilesRes.ok) {
            const allFiles = await allFilesRes.json();
            console.log('All Files Response:', allFiles);
            console.log('Total files in system:', allFiles.files?.length || 0);
        } else {
            console.error('All Files API failed:', await allFilesRes.text());
        }
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Instructions for the user
console.log(`
=== FILES API TEST SCRIPT ===

To test the files API:

1. Open browser developer tools (F12)
2. Go to Console tab
3. Copy and paste this entire script
4. Press Enter to run it

This will test:
- User profile mapping (users.id 9 -> efiling_users.id 3)
- Files created by efiling user 3
- Files assigned to efiling user 3  
- All files in the system

Run: testFilesAPI()
`);

// Make the function available globally
window.testFilesAPI = testFilesAPI;
