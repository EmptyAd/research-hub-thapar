import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useResearchPapers } from '@/hooks/useResearchPapers';
import { useToast } from '@/hooks/use-toast';
import { Upload, X } from 'lucide-react';

interface FileUploadProps {
  onFileUpload: (url: string) => void;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}

export const FileUpload = ({ onFileUpload, disabled, onUploadingChange }: FileUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useResearchPapers();
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (file.type !== 'application/pdf') {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF file.",
        variant: "destructive"
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 10MB.",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    onUploadingChange?.(true);
    setFileName(file.name);

    try {
      const url = await uploadFile(file);
      onFileUpload(url);
      toast({
        title: "File uploaded",
        description: "Your PDF has been uploaded successfully."
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive"
      });
      setFileName(null);
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  };

  const clearFile = () => {
    setFileName(null);
    onFileUpload('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="pdf-upload">PDF File</Label>
      {fileName ? (
        <div className="flex items-center gap-2 p-3 border rounded-md">
          <span className="text-sm flex-1 truncate">{fileName}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFile}
            disabled={disabled}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Input
            ref={fileInputRef}
            id="pdf-upload"
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            disabled={disabled || uploading}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? "Uploading..." : "Upload PDF"}
          </Button>
        </div>
      )}
    </div>
  );
};