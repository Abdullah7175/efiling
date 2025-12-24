"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Search, Users, Building2, MapPin, Shield, X, Send, Clock, UsersRound, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SCOPE_LABELS = {
  global: "Global",
  division: "Division",
  district: "District",
  town: "Town",
};

export default function MarkToModal({ showMarkToModal, onClose, fileId, fileNumber, subject, onSuccess }) {
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [remarks, setRemarks] = useState("");
  const [fetching, setFetching] = useState(false);
  const [marking, setMarking] = useState(false);
  const [allowedRecipients, setAllowedRecipients] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [error, setError] = useState(null);
  const [workflowState, setWorkflowState] = useState(null);
  const [isTeamInternal, setIsTeamInternal] = useState(false);

  useEffect(() => {
    if (!showMarkToModal || !fileId) {
      return;
    }

    let active = true;
    async function loadRecipients() {
      setFetching(true);
      setError(null);
      setAllowedRecipients([]);
      setSelectedIds([]);

      try {
        const res = await fetch(`/api/efiling/files/${fileId}/mark-to`, { cache: "no-store" });
        if (!active) return;

        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || `Failed to load recipients (${res.status})`);
        }

        const data = await res.json();
        setAllowedRecipients(Array.isArray(data.allowed_recipients) ? data.allowed_recipients : []);
        
        // Fetch workflow state to show TAT status
        try {
            const permRes = await fetch(`/api/efiling/files/${fileId}/permissions`);
            if (permRes.ok) {
                const permData = await permRes.json();
                if (permData.permissions) {
                    setWorkflowState(permData.permissions.workflow_state);
                    setIsTeamInternal(permData.permissions.is_within_team);
                }
            }
        } catch (err) {
            console.warn('Failed to fetch workflow state:', err);
        }
      } catch (err) {
        if (!active) return;
        console.error("Failed to load mark-to recipients:", err);
        setError(err.message || "Unable to load allowed recipients");
      } finally {
        if (active) {
          setFetching(false);
        }
      }
    }

    loadRecipients();
    return () => {
      active = false;
    };
  }, [showMarkToModal, fileId]);

  const handleToggleRecipient = (recipientId) => {
    // Sequential workflow - only one recipient at a time
    setSelectedIds([recipientId]);
  };

  const filteredRecipients = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return allowedRecipients;

    return allowedRecipients.filter((recipient) => {
      const fields = [
        recipient.user_name,
        recipient.role_name,
        recipient.role_code,
        recipient.department_name,
        recipient.district_name,
        recipient.town_name,
        recipient.division_name,
      ];
      return fields.some((field) => field && field.toLowerCase().includes(term));
    });
  }, [allowedRecipients, searchTerm]);

  const selectedRecipients = useMemo(
    () => allowedRecipients.filter((recipient) => selectedIds.includes(recipient.id)),
    [allowedRecipients, selectedIds]
  );

  const summaryRemarks = useMemo(() => {
    if (remarks.trim()) return remarks.trim();
    if (selectedRecipients.length === 0) return "";
    const names = selectedRecipients.map((r) => r.user_name).join(", ");
    return `File forwarded to ${names}`;
  }, [remarks, selectedRecipients]);

  const handleSubmit = async () => {
    if (selectedRecipients.length === 0) {
      toast({
        title: "No recipient selected",
        description: "Please choose an allowed user to mark the file to.",
        variant: "destructive",
      });
      return;
    }

    // Sequential workflow - only one recipient
    if (selectedRecipients.length > 1) {
      toast({
        title: "Multiple recipients not allowed",
        description: "Please select only one user at a time (sequential workflow).",
        variant: "destructive",
      });
      return;
    }

    setMarking(true);
    try {
      const res = await fetch(`/api/efiling/files/${fileId}/mark-to`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: [selectedRecipients[0].id], // Only first one (sequential workflow)
          remarks: summaryRemarks,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to mark file");
      }

      const result = await res.json();
      const tatStarted = result.tat_started;
      const isTeamInternal = result.is_team_internal;

      toast({
        title: "Marked successfully",
        description: tatStarted 
          ? `File marked to ${selectedRecipients[0].user_name}. TAT timer has started.`
          : isTeamInternal
          ? `File marked to ${selectedRecipients[0].user_name} (Team workflow - No TAT).`
          : `File marked to ${selectedRecipients[0].user_name}.`,
      });
      onSuccess?.();
      onClose?.();
    } catch (err) {
      console.error("Failed to mark file:", err);
      toast({
        title: "Unable to mark",
        description: err.message || "Unable to mark file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setMarking(false);
    }
  };

  if (!showMarkToModal) {
    return null;
  }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b">
                    <div>
                        <h2 className="text-xl font-semibold">Mark File To Users</h2>
                        <p className="text-sm text-gray-600 mt-1">
                            {fileNumber} - {subject}
                        </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                    {/* Workflow State Info */}
                    {workflowState && (
                        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center gap-2 text-sm">
                                <Clock className="w-4 h-4 text-blue-600" />
                                <span className="font-medium text-blue-900">
                                    Workflow Status: {workflowState === 'TEAM_INTERNAL' ? 'Team Internal' : 
                                                     workflowState === 'EXTERNAL' ? 'External (TAT Active)' : 
                                                     'Returned to Creator'}
                                </span>
                                {isTeamInternal && (
                                    <Badge variant="outline" className="ml-2 text-xs">
                                        No TAT
                                    </Badge>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <Label className="text-sm font-medium">Allowed Recipients</Label>
                            <p className="text-xs text-gray-500 mt-1 mb-3">
                                Search by name, role, department, or location
                            </p>

                            <div className="relative mb-3">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <Input
                                    placeholder="Search by name, role, department, or location"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                />
                            </div>

                            <div className="border rounded-lg max-h-64 overflow-y-auto">
                                {fetching && allowedRecipients.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-gray-500">
                                        Loading allowed recipients...
                                    </div>
                                ) : filteredRecipients.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-gray-500">
                                        {error || "No recipients match your search."}
                                    </div>
                                ) : (
                                    filteredRecipients.map((recipient) => {
                                        const selected = selectedIds.includes(recipient.id);
                                        const scopeLabel = SCOPE_LABELS[recipient.allowed_level_scope?.toLowerCase?.()] || recipient.allowed_level_scope;
                                        const isTeamMember = recipient.is_team_member;
                                        
                                        // Check if marking to this recipient will start TAT
                                        const willStartTAT = !isTeamInternal && 
                                                           ['SE', 'CE', 'CFO', 'COO', 'CEO'].includes((recipient.role_code || '').toUpperCase());

                                        return (
                                            <Card 
                                                key={recipient.id} 
                                                className={`cursor-pointer transition-colors mb-2 ${
                                                    selected ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'
                                                }`}
                                                onClick={() => handleToggleRecipient(recipient.id)}
                                            >
                                                <CardContent className="p-4">
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <div className="font-medium text-sm">
                                                                    {recipient.user_name}
                                                                </div>
                                                                {isTeamMember && (
                                                                    <Badge variant="secondary" className="text-xs">
                                                                        Team Member
                                                                    </Badge>
                                                                )}
                                                                {willStartTAT && (
                                                                    <Badge className="bg-orange-100 text-orange-800 text-xs">
                                                                        Will Start TAT
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-gray-600 space-y-1">
                                                                <div className="flex items-center gap-1">
                                                                    <Shield className="w-3 h-3" />
                                                                    <span>{recipient.role_name} ({recipient.role_code})</span>
                                                                </div>
                                                                {recipient.department_name && (
                                                                    <div className="flex items-center gap-1">
                                                                        <Building2 className="w-3 h-3" />
                                                                        <span>{recipient.department_name}</span>
                                                                    </div>
                                                                )}
                                                                {(recipient.district_name || recipient.town_name || recipient.division_name) && (
                                                                    <div className="flex items-center gap-1">
                                                                        <MapPin className="w-3 h-3" />
                                                                        <span>
                                                                            {[
                                                                                recipient.division_name,
                                                                                recipient.district_name,
                                                                                recipient.town_name
                                                                            ].filter(Boolean).join(", ")}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                {scopeLabel && (
                                                                    <div className="text-xs text-gray-500 mt-1">
                                                                        Scope: {scopeLabel.toLowerCase()}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {isTeamInternal && (
                                                                <div className="mt-2 text-xs text-gray-500">
                                                                    Team workflow - No TAT
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="ml-4">
                                                            {selected ? (
                                                                <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                                                                    <X className="w-4 h-4 text-white" />
                                                                </div>
                                                            ) : (
                                                                <div className="w-6 h-6 rounded-full border-2 border-gray-300"></div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        );
                                    })
                                )}
                            </div>

                            <div className="mt-6">
                                <Label className="text-sm font-medium">Remarks (optional)</Label>
                                <Textarea
                                    value={remarks}
                                    onChange={(e) => setRemarks(e.target.value)}
                                    placeholder="Provide any remarks for the recipients"
                                    className="mt-2"
                                    rows={4}
                                />
                                {summaryRemarks && (
                                    <p className="mt-2 text-xs text-gray-500">
                                        This message will be stored with the movement:
                                        <br />
                                        <span className="text-gray-700">{summaryRemarks}</span>
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end space-x-3 p-6 border-t bg-gray-50">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleSubmit}
                        disabled={marking || selectedRecipients.length === 0}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        {marking ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                Marking...
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4 mr-2" />
                                Mark To {selectedRecipients.length > 0 ? `(${selectedRecipients.length})` : ''}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
