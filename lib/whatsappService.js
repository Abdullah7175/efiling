/**
 * WhatsApp API Service
 * Sends messages via the WhatsApp API endpoint
 */

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'http://erp.rehmanigroup.com:8003/whatsapp.php';

// Handle WhatsApp secret key - try multiple methods to read it
// This is a workaround for Next.js 13.5.11 env variable interpolation issues with $ characters
// TEMPORARY FIX: Hardcode the secret key here since Next.js can't parse $ in .env files
// TODO: Move this back to .env file once Next.js env parsing is fixed
let WHATSAPP_SECRET_KEY = process.env.WHATSAPP_SECRET_KEY || '$343XSWE12$$';

// If env var is set but empty, use the hardcoded fallback
if (!WHATSAPP_SECRET_KEY || WHATSAPP_SECRET_KEY === '') {
    WHATSAPP_SECRET_KEY = '$343XSWE12$$';
}

// Clean up the value if it was escaped (remove any double dollar signs that Next.js might have added)
if (WHATSAPP_SECRET_KEY && WHATSAPP_SECRET_KEY.includes('$$') && !WHATSAPP_SECRET_KEY.startsWith('$343XSWE12$$')) {
    // If it's still escaped, we need to unescape it
    // This handles cases where Next.js didn't properly parse it
    WHATSAPP_SECRET_KEY = WHATSAPP_SECRET_KEY.replace(/\$\$/g, '$');
}

/**
 * Send WhatsApp message
 * @param {string} phoneNumber - Phone number (with country code, e.g., 923001234567)
 * @param {string} message - Message to send
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
export async function sendWhatsAppMessage(phoneNumber, message) {
    try {
        // Clean phone number - remove any spaces, dashes, or special characters
        const cleanPhone = phoneNumber.replace(/[\s\-\(\)\+]/g, '');
        
        // Format phone number for WhatsApp API
        // API accepts both local format (03330355270) and country code format (923330355270)
        // We'll try to preserve the format if it starts with 0, otherwise convert to country code
        let formattedPhone = cleanPhone;
        
        if (cleanPhone.startsWith('0')) {
            // Keep local format (e.g., 03330355270) - API accepts this
            formattedPhone = cleanPhone;
        } else if (cleanPhone.startsWith('92')) {
            // Already in country code format (e.g., 923330355270)
            formattedPhone = cleanPhone;
        } else if (cleanPhone.startsWith('+92')) {
            // Remove + from country code format
            formattedPhone = cleanPhone.substring(1);
        } else {
            // Convert to country code format (assume Pakistan +92)
            formattedPhone = '92' + cleanPhone;
        }

        // Validate secret key
        if (!WHATSAPP_SECRET_KEY) {
            throw new Error('WhatsApp secret key is not configured. Please set WHATSAPP_SECRET_KEY in environment variables.');
        }

        // Prepare request payload with correct API field names
        // API expects: mobile_number, message, secreate_key (note: secreate_key not secret_key)
        // The API likely expects form data, not JSON
        const formData = new URLSearchParams();
        formData.append('secreate_key', WHATSAPP_SECRET_KEY);
        formData.append('mobile_number', formattedPhone);
        formData.append('message', message);

        console.log('Sending WhatsApp message:', {
            mobile_number: formattedPhone,
            messageLength: message.length,
            secreate_key: WHATSAPP_SECRET_KEY ? '***configured***' : 'missing',
            api_url: WHATSAPP_API_URL,
            format: 'form-data'
        });
        
        // Debug: Log the actual payload (without exposing full secret key)
        console.log('WhatsApp payload:', {
            mobile_number: formattedPhone,
            message: message.substring(0, 50) + '...',
            secreate_key: WHATSAPP_SECRET_KEY ? WHATSAPP_SECRET_KEY.substring(0, 3) + '***' : 'missing'
        });

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        // Send request to WhatsApp API as form data
        const response = await fetch(WHATSAPP_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString(),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('WhatsApp API error:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText,
                url: WHATSAPP_API_URL,
                requestMethod: 'POST',
                contentType: 'application/x-www-form-urlencoded'
            });
            
            // Special handling for 404 - URL might be incorrect
            if (response.status === 404) {
                throw new Error(`WhatsApp API endpoint not found (404). Please verify the URL: ${WHATSAPP_API_URL}. The endpoint might be at a different path or the server might be down.`);
            }
            
            throw new Error(`WhatsApp API returned status ${response.status}: ${errorText.substring(0, 200)}`);
        }

        // Try to parse JSON response
        let result;
        const responseText = await response.text();
        try {
            result = JSON.parse(responseText);
        } catch (parseError) {
            console.error('Failed to parse WhatsApp API response as JSON:', {
                responseText: responseText,
                error: parseError.message
            });
            // If response is not JSON but status is OK, consider it success
            if (response.ok) {
                return {
                    success: true,
                    message: 'WhatsApp message sent successfully',
                    data: { rawResponse: responseText }
                };
            }
            throw new Error(`Invalid JSON response from WhatsApp API: ${responseText}`);
        }
        
        console.log('WhatsApp API response:', result);

        // Check if the API returned success
        if (result.success || result.status === 'success' || response.ok) {
            return {
                success: true,
                message: 'WhatsApp message sent successfully',
                data: result
            };
        } else {
            return {
                success: false,
                error: result.message || result.error || 'Failed to send WhatsApp message',
                data: result
            };
        }

    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        
        // Handle timeout
        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
            return {
                success: false,
                error: 'WhatsApp API request timed out. Please try again.'
            };
        }

        // Handle network errors
        if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
            return {
                success: false,
                error: 'Unable to connect to WhatsApp service. Please try again later.'
            };
        }

        return {
            success: false,
            error: error.message || 'Failed to send WhatsApp message'
        };
    }
}

/**
 * Send OTP via WhatsApp
 * @param {string} phoneNumber - User's phone number
 * @param {string} otpCode - 6-digit OTP code
 * @param {string} userName - User's name (optional)
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
export async function sendOTPViaWhatsApp(phoneNumber, otpCode, userName = 'User') {
    const message = `Dear ${userName},\n\nYour OTP for e-signature verification is: ${otpCode}\n\nThis code is valid for 10 minutes. Please do not share this code with anyone.\n\nThank you,\nE-Filing System`;
    
    return await sendWhatsAppMessage(phoneNumber, message);
}

