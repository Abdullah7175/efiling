# WhatsApp OTP Troubleshooting Guide

## Current Issue
Getting 500 error when trying to send OTP via WhatsApp.

## Steps to Diagnose

### 1. Check Server Logs
On your production server (`/opt/new`), check the logs:

```bash
# If using PM2
pm2 logs

# Or check Next.js console output
# The logs should show detailed error information
```

Look for:
- `Error sending OTP:` - This will show the actual error
- `WhatsApp API error:` - This will show API response details
- `Exception while sending WhatsApp OTP:` - This will show any exceptions

### 2. Verify WhatsApp Secret Key
The secret key should be hardcoded in `lib/whatsappService.js` as `$343XSWE12$$`.

Check the logs for:
```
secreate_key: ***configured***
```

If it shows `missing`, the secret key is not set correctly.

### 3. Test WhatsApp API Directly
Test the API endpoint directly from the server:

```bash
curl -X POST http://erp.rehmanigroup.com:8003/whatsapp.php \
  -H "Content-Type: application/json" \
  -d '{
    "mobile_number": "03330355270",
    "message": "Test message",
    "secreate_key": "$343XSWE12$$"
  }'
```

This will tell you if:
- The API is accessible from your server
- The API accepts the request format
- The secret key is correct

### 4. Common Issues and Solutions

#### Issue: Network/Connection Error
**Symptoms:** `ECONNREFUSED`, `fetch failed`, timeout errors
**Solution:** 
- Check if the WhatsApp API server is accessible from your production server
- Verify firewall rules allow outbound connections to `erp.rehmanigroup.com:8003`
- Test with curl (see step 3)

#### Issue: Invalid JSON Response
**Symptoms:** `Failed to parse WhatsApp API response as JSON`
**Solution:**
- The API might be returning HTML or plain text instead of JSON
- Check what the API actually returns (see step 3)
- Update the response parsing logic if needed

#### Issue: Secret Key Not Set
**Symptoms:** `WhatsApp secret key is not configured`
**Solution:**
- Verify `lib/whatsappService.js` has the hardcoded value: `$343XSWE12$$`
- The code should have: `let WHATSAPP_SECRET_KEY = process.env.WHATSAPP_SECRET_KEY || '$343XSWE12$$';`

#### Issue: API Returns Error Status
**Symptoms:** `WhatsApp API returned status XXX`
**Solution:**
- Check the error message in the logs
- Verify the API credentials are correct
- Check if the API has rate limiting or other restrictions

### 5. Check Database Connection
The OTP is stored in the database. If database connection fails, the whole request fails.

Check for:
- `Database connection attempt X failed`
- Verify database credentials in `.env` file
- Ensure PostgreSQL is running and accessible

## Expected API Request Format

The code sends:
```json
{
  "mobile_number": "03330355270",
  "message": "Dear User,\n\nYour OTP for e-signature verification is: 123456\n\n...",
  "secreate_key": "$343XSWE12$$"
}
```

## Next Steps

1. **Check server logs** for the actual error message
2. **Test the API directly** with curl
3. **Verify network connectivity** to the WhatsApp API server
4. **Check database connection** is working

Once you have the error message from the logs, we can fix the specific issue.

