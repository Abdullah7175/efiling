"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { AlertCircle, Lock, CheckCircle, Clock } from "lucide-react";

export default function UploadPermissionGuard({ 
  children, 
  workRequestId, 
  mediaType, 
  fallbackMessage = "Upload not allowed for this request" 
}) {
  const { data: session } = useSession();
  const [permission, setPermission] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workRequestId || !mediaType || !session?.user) {
      setLoading(false);
      return;
    }

    const checkPermission = async () => {
      try {
        const response = await fetch(
          `/api/requests/${workRequestId}/upload-permission?type=${mediaType}`
        );
        
        if (response.ok) {
          const data = await response.json();
          setPermission(data.data);
        } else {
          setPermission({ canUpload: false, reason: "Failed to check permissions" });
        }
      } catch (error) {
        console.error('Error checking upload permission:', error);
        setPermission({ canUpload: false, reason: "Error checking permissions" });
      } finally {
        setLoading(false);
      }
    };

    checkPermission();
  }, [workRequestId, mediaType, session]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Checking permissions...</span>
      </div>
    );
  }

  if (!permission) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center space-x-2">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-red-800 font-medium">Permission Error</span>
        </div>
        <p className="text-red-700 mt-1">{fallbackMessage}</p>
      </div>
    );
  }

  if (!permission.canUpload) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Lock className="w-5 h-5 text-yellow-600 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-yellow-800">
              Upload Restricted
            </h3>
            <p className="text-sm text-yellow-700 mt-1">
              {permission.reason}
            </p>
            {permission.approvalStatus === 'pending' && (
              <div className="mt-2 flex items-center space-x-2 text-xs text-yellow-600">
                <Clock className="w-3 h-3" />
                <span>Request is pending CEO approval</span>
              </div>
            )}
            {permission.approvalStatus === 'rejected' && (
              <div className="mt-2 flex items-center space-x-2 text-xs text-yellow-600">
                <AlertCircle className="w-3 h-3" />
                <span>Request was rejected by CEO KW&SC</span>
              </div>
            )}
            {permission.allowedMediaTypes.length > 0 && (
              <p className="text-xs text-yellow-600 mt-1">
                Allowed media types: {permission.allowedMediaTypes.join(', ')}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Permission Status Indicator */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
        <div className="flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <span className="text-green-800 text-sm font-medium">
            Upload Allowed
          </span>
        </div>
        <p className="text-green-700 text-xs mt-1">
          {permission.reason}
        </p>
      </div>
      
      {/* Upload Component */}
      {children}
    </div>
  );
}
