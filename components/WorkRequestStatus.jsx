"use client";
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Pause,
  Play
} from "lucide-react";

export default function WorkRequestStatus({ status, approvalStatus, className = "" }) {
  const getStatusInfo = () => {
    // CEO approval mechanism removed - use regular status only
    switch (status?.toLowerCase()) {
      case 'pending':
        return {
          text: 'Pending',
          icon: Clock,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100',
          borderColor: 'border-yellow-200'
        };
      case 'approved':
      case 'completed':
        return {
          text: status || 'Approved',
          icon: CheckCircle,
          color: 'text-green-600',
          bgColor: 'bg-green-100',
          borderColor: 'border-green-200'
        };
      case 'rejected':
        return {
          text: 'Rejected',
          icon: XCircle,
          color: 'text-red-600',
          bgColor: 'bg-red-100',
          borderColor: 'border-red-200'
        };
      case 'paused':
        return {
          text: 'Paused',
          icon: Pause,
          color: 'text-orange-600',
          bgColor: 'bg-orange-100',
          borderColor: 'border-orange-200'
        };
      default:
        return {
          text: status || 'Unknown',
          icon: AlertTriangle,
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          borderColor: 'border-gray-200'
        };
    }
  };

  const statusInfo = getStatusInfo();
  const Icon = statusInfo.icon;

  return (
    <span className={`
      inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
      ${statusInfo.color} ${statusInfo.bgColor} ${statusInfo.borderColor}
      border ${className}
    `}>
      <Icon className="w-3 h-3 mr-1" />
      {statusInfo.text}
    </span>
  );
}
