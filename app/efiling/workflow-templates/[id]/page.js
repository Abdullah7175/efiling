"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, Trash2, Eye, Plus } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";

export default function WorkflowTemplatePage({ params }) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const templateId = params.id;
  
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTemplate = async () => {
      if (templateId) {
        try {
          setLoading(true);
          const response = await fetch(`/api/efiling/workflow-templates?id=${templateId}`);
          if (response.ok) {
            const data = await response.json();
            setTemplate(data);
          } else {
            setError('Failed to fetch workflow template');
          }
        } catch (error) {
          console.error('Error fetching workflow template:', error);
          setError('Error fetching workflow template');
        } finally {
          setLoading(false);
        }
      }
    };

    fetchTemplate();
  }, [templateId]);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this workflow template?')) return;
    
    try {
      const response = await fetch('/api/efiling/workflow-templates', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: templateId }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Workflow template deleted successfully",
          variant: "success"
        });
        window.location.href = "/efiling/workflow-templates";
      } else {
        throw new Error('Failed to delete workflow template');
      }
    } catch (error) {
      console.error('Error deleting workflow template:', error);
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete workflow template",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-10">
        <div className="flex items-center justify-center h-96 text-lg">Loading workflow template...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-10">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="text-red-600 text-lg font-medium mb-2">Error Loading Template</div>
            <div className="text-gray-600 mb-4">{error}</div>
            <Link href="/efiling/workflow-templates">
              <Button>Back to Templates</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="container mx-auto px-4 py-10">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="text-red-600 text-lg font-medium mb-2">Template Not Found</div>
            <div className="text-gray-600 mb-4">The workflow template you're looking for doesn't exist.</div>
            <Link href="/efiling/workflow-templates">
              <Button>Back to Templates</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/efiling/workflow-templates" className="flex items-center gap-2 text-blue-600 hover:text-blue-800">
            <ArrowLeft className="w-4 h-4" />
            Back to Templates
          </Link>
        </div>
        
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-2">{template.name}</h1>
            <p className="text-gray-600">
              Workflow Template Details
            </p>
          </div>
          
          <div className="flex gap-2">
            <Link href={`/efiling/workflow-templates/${templateId}/edit`}>
              <Button variant="outline" className="flex items-center gap-2">
                <Edit className="w-4 h-4" />
                Edit
              </Button>
            </Link>
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              className="flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Template Information */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Template Information</h2>
          <div className="space-y-3">
            <div>
              <span className="font-medium text-gray-700">Name:</span>
              <span className="ml-2">{template.name}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">File Type ID:</span>
              <span className="ml-2">{template.file_type_id}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Status:</span>
              <Badge variant={template.is_active ? "default" : "secondary"} className="ml-2">
                {template.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div>
              <span className="font-medium text-gray-700">Created:</span>
              <span className="ml-2">{template.created_at ? new Date(template.created_at).toLocaleDateString() : "-"}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Updated:</span>
              <span className="ml-2">{template.updated_at ? new Date(template.updated_at).toLocaleDateString() : "-"}</span>
            </div>
          </div>
        </Card>

        {/* Workflow Stages */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Workflow Stages</h2>
          {template.stages && template.stages.length > 0 ? (
            <div className="space-y-3">
              {template.stages.map((stage, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{stage.name}</div>
                    {stage.description && (
                      <div className="text-sm text-gray-600">{stage.description}</div>
                    )}
                  </div>
                  <Badge variant="outline">{stage.type || "Stage"}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-500 text-center py-8">
              No stages defined for this template
            </div>
          )}
        </Card>
      </div>

      {/* Additional Details */}
      {template.description && (
        <Card className="p-6 mt-6">
          <h2 className="text-xl font-semibold mb-4">Description</h2>
          <p className="text-gray-700">{template.description}</p>
        </Card>
      )}
    </div>
  );
}
